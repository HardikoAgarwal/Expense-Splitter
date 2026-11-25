-- 1) Removing someone who still has a balance: the group admin can "write it off".
--    A write-off is recorded as approved settlement rows (write_off = true) between
--    the leaver and the people on the other side of their balance, so every net
--    balance stays exact: the leaver ends at zero and the people owed (or owing)
--    them carry exactly their share of it. No money is assumed to have moved, and
--    write-offs never lock expense dates.
-- 2) A group admin can edit or delete an expense whose creator has left the group.

alter table public.settlements add column if not exists write_off boolean not null default false;

create or replace function public.group_lock_date(p_group_id uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select max(up_to_date)
  from public.settlements
  where group_id = p_group_id
    and status = 'approved'
    and not write_off;
$$;

create or replace function public.group_lock_at(p_group_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(coalesce(resolved_at, created_at))
  from public.settlements
  where group_id = p_group_id
    and status = 'approved'
    and not write_off
    and up_to_date = public.group_lock_date(p_group_id);
$$;

-- member_exit_block gains a flag to ignore money (used by write-off removals).
drop function if exists public.member_exit_block(uuid, uuid, boolean);

create or replace function public.member_exit_block(
  p_group_id uuid,
  p_user_id uuid,
  p_self boolean,
  p_ignore_money boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  net bigint;
  amount text;
  role_now text;
  admins int;
  members int;
begin
  select role into role_now from public.group_members
    where group_id = p_group_id and user_id = p_user_id and left_at is null;
  if role_now is null then
    return 'That person is not in the group';
  end if;

  select count(*) into members from public.group_members where group_id = p_group_id and left_at is null;
  select count(*) into admins from public.group_members
    where group_id = p_group_id and role = 'admin' and left_at is null;

  if members <= 1 then
    return 'You are the only person here. Delete the group instead.';
  end if;
  if role_now = 'admin' and admins <= 1 then
    return case when p_self
      then 'Make someone else an admin before you leave.'
      else 'A group needs at least one admin' end;
  end if;
  if p_ignore_money then
    return null;
  end if;

  select coalesce(b.net_paise, 0) into net
    from public.group_member_balances b
    where b.group_id = p_group_id and b.user_id = p_user_id;
  net := coalesce(net, 0);
  if net <> 0 then
    amount := to_char(abs(net) / 100.0, 'FM9999999990.00');
    if p_self then
      return case when net < 0
        then 'You still owe ₹' || amount || ' in this group. Settle up first.'
        else 'You are still owed ₹' || amount || ' in this group. Settle up first.' end;
    end if;
    return case when net < 0
      then 'They still owe ₹' || amount || '. Settle up first.'
      else 'They are still owed ₹' || amount || '. Settle up first.' end;
  end if;

  if exists (
    select 1 from public.settlements
    where group_id = p_group_id and status = 'pending'
      and (from_user_id = p_user_id or to_user_id = p_user_id)
  ) then
    return case when p_self
      then 'You have a payment waiting for approval. Resolve it first.'
      else 'They have a payment waiting for approval. Resolve it first.' end;
  end if;
  return null;
end;
$$;

revoke all on function public.member_exit_block(uuid, uuid, boolean, boolean) from public;

drop function if exists public.remove_group_member(uuid, uuid);

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
    -- Payments still waiting for approval are cancelled: they would never be confirmed.
    delete from public.settlements
      where group_id = p_group_id and status = 'pending'
        and (from_user_id = p_user_id or to_user_id = p_user_id);

    -- One approved write-off per person on the other side of the leaver's balance.
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

  update public.group_members set left_at = now() where group_id = p_group_id and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_group_member(uuid, uuid, boolean) from public;
grant execute on function public.remove_group_member(uuid, uuid, boolean) to authenticated;

-- Expenses added by someone who has since left can be changed by a group admin.
create or replace function public.expense_creator_only()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  orphan_admin boolean;
begin
  -- Server-side jobs and the SQL editor run without a user; let them through.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  orphan_admin := public.is_group_admin(old.group_id, auth.uid())
    and not public.is_group_member(old.group_id, old.created_by);
  if tg_op = 'DELETE' then
    -- Deleting a whole group cascades to its expenses; the group row is already gone then.
    if not exists (select 1 from public.groups g where g.id = old.group_id) then
      return old;
    end if;
    if old.created_by <> auth.uid() and not orphan_admin then
      raise exception 'Only the person who added this expense can edit or delete it';
    end if;
    return old;
  end if;
  if old.created_by <> auth.uid() and not orphan_admin then
    raise exception 'Only the person who added this expense can edit or delete it';
  end if;
  -- The creator never changes.
  new.created_by := old.created_by;
  return new;
end;
$$;
