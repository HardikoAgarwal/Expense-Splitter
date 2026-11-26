-- Disputes that nobody can answer, and a cap on how many people one invite code can bring in.

-- 1. A person who leaves has settled to zero, so disputes they raised are moot: close them.
create or replace function public.close_member_flags(p_group_id uuid, p_user_id uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
begin
  for f in
    select ef.id
    from public.expense_flags ef
    join public.expenses e on e.id = ef.expense_id
    where e.group_id = p_group_id and ef.user_id = p_user_id and ef.resolved_at is null
  loop
    update public.expense_flags set resolved_at = now(), resolved_by = p_actor where id = f.id;
    insert into public.expense_flag_events (flag_id, actor_id, kind, note)
    values (f.id, p_actor, 'resolved', 'Closed because they left the group');
  end loop;
end;
$$;

revoke all on function public.close_member_flags(uuid, uuid, uuid) from public;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  blocked text;
begin
  if me is null or not public.is_group_member(p_group_id, me) then
    raise exception 'You are not in this group';
  end if;
  blocked := public.member_exit_block(p_group_id, me, true);
  if blocked is not null then
    raise exception '%', blocked;
  end if;
  perform public.close_member_flags(p_group_id, me, me);
  update public.group_members set left_at = now() where group_id = p_group_id and user_id = me;
end;
$$;

create or replace function public.remove_group_member(
  p_group_id uuid,
  p_user_id uuid,
  p_write_off boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  blocked text;
  leftover bigint;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  if p_write_off and p_user_id = me then
    raise exception 'You cannot write off your own balance';
  end if;
  blocked := public.member_exit_block(p_group_id, p_user_id, p_user_id = me, p_write_off);
  if blocked is not null then
    raise exception '%', blocked;
  end if;

  if p_write_off then
    delete from public.settlements
      where group_id = p_group_id and status = 'pending'
        and (from_user_id = p_user_id or to_user_id = p_user_id);

    insert into public.settlements (
      group_id, from_user_id, to_user_id, amount_paise, up_to_date,
      status, created_by, resolved_at, write_off
    )
    select p_group_id, d.from_user_id, d.to_user_id, d.amount_paise, current_date,
           'approved', me, now(), true
    from public.simplified_debts(p_group_id) d
    where d.from_user_id = p_user_id or d.to_user_id = p_user_id;

    select coalesce(b.net_paise, 0) into leftover
      from public.group_member_balances b
      where b.group_id = p_group_id and b.user_id = p_user_id;
    if coalesce(leftover, 0) <> 0 then
      raise exception 'Could not settle that balance. Nothing was changed.';
    end if;
  end if;

  perform public.close_member_flags(p_group_id, p_user_id, me);
  update public.group_members set left_at = now() where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- 2. When the creator and the payer have both left, nobody can answer a dispute on that
-- expense, so a group admin may close it. Otherwise only the flagger can resolve it.
create or replace function public.resolve_expense_flag(p_flag_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  flag public.expense_flags%rowtype;
  exp public.expenses%rowtype;
  orphaned boolean;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select * into flag from public.expense_flags where id = p_flag_id and resolved_at is null for update;
  if not found then
    raise exception 'That dispute is already resolved';
  end if;
  select * into exp from public.expenses where id = flag.expense_id;
  orphaned := public.is_group_admin(exp.group_id, me)
    and not public.is_group_member(exp.group_id, exp.created_by)
    and not public.is_group_member(exp.group_id, exp.payer_id);
  if me <> flag.user_id and not orphaned then
    raise exception 'Only the person who flagged it can resolve it';
  end if;
  update public.expense_flags set resolved_at = now(), resolved_by = me where id = p_flag_id;
  insert into public.expense_flag_events (flag_id, actor_id, kind) values (p_flag_id, me, 'resolved');
  perform public.dispute_notice(exp.created_by, me, exp.id, 'resolved', null);
  if exp.payer_id <> exp.created_by then
    perform public.dispute_notice(exp.payer_id, me, exp.id, 'resolved', null);
  end if;
end;
$$;

-- 3. An invite code can bring in a limited number of people, then it stops working.
alter table public.invites add column if not exists uses int not null default 0;
alter table public.invites add column if not exists max_uses int not null default 20;

create or replace function public.join_group_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  inv public.invites%rowtype;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select * into inv from public.invites where code = upper(trim(coalesce(p_code, ''))) for update;
  if not found then
    raise exception 'This invite is invalid';
  end if;
  if inv.expires_at <= now() then
    raise exception 'This invite has expired';
  end if;
  if public.is_group_member(inv.group_id, me) then
    return inv.group_id;
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'This invite has reached its limit. Ask for a new one';
  end if;
  update public.group_members
    set left_at = null, role = 'member', joined_at = now()
    where group_id = inv.group_id and user_id = me;
  if not found then
    insert into public.group_members (group_id, user_id, role)
    values (inv.group_id, me, 'member');
  end if;
  update public.invites set uses = uses + 1 where id = inv.id;
  return inv.group_id;
end;
$$;
