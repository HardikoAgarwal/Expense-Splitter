-- Leaving and removing group members.
-- A person can leave (or be removed) only when they are settled up in that group.
-- The membership row is kept with left_at set, so old expenses still show their name.
-- Expenses that involve someone who left are read-only so balances never change.

alter table public.group_members add column if not exists left_at timestamptz;

-- Everything that asks "is this person in the group" now ignores people who left.
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = p_user_id
      and left_at is null
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = p_user_id
      and role = 'admin'
      and left_at is null
  );
$$;

-- People you share a group with stay readable (so old expenses show their name),
-- but only while you are still in that group yourself.
create or replace function public.shares_group(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid()
      and mine.left_at is null
      and theirs.user_id = p_user_id
  );
$$;

drop policy if exists expense_flags_select on public.expense_flags;
create policy expense_flags_select on public.expense_flags
  for select to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      join public.group_members m on m.group_id = e.group_id
      where e.id = expense_id
        and m.user_id = auth.uid()
        and m.left_at is null
    )
  );

drop policy if exists expense_flag_events_select on public.expense_flag_events;
create policy expense_flag_events_select on public.expense_flag_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.expense_flags f
      join public.expenses e on e.id = f.expense_id
      join public.group_members m on m.group_id = e.group_id
      where f.id = flag_id
        and m.user_id = auth.uid()
        and m.left_at is null
    )
  );

-- Balances only list people who are still in the group.
create or replace view public.group_member_balances
with (security_invoker = true) as
select
  m.group_id,
  m.user_id,
  coalesce(p.paid, 0)::bigint as paid_paise,
  coalesce(o.owed, 0)::bigint as owed_paise,
  coalesce(so.paid_out, 0)::bigint as settlements_paid_paise,
  coalesce(si.received, 0)::bigint as settlements_received_paise,
  (
    coalesce(p.paid, 0) - coalesce(o.owed, 0)
    + coalesce(so.paid_out, 0) - coalesce(si.received, 0)
  )::bigint as net_paise
from public.group_members m
left join (
  select group_id, payer_id as user_id, sum(amount_paise)::bigint as paid
  from public.expenses
  group by group_id, payer_id
) p on p.group_id = m.group_id and p.user_id = m.user_id
left join (
  select e.group_id, s.user_id, sum(s.share_paise)::bigint as owed
  from public.expense_shares s
  join public.expenses e on e.id = s.expense_id
  group by e.group_id, s.user_id
) o on o.group_id = m.group_id and o.user_id = m.user_id
left join (
  select group_id, from_user_id as user_id, sum(amount_paise)::bigint as paid_out
  from public.settlements
  where status = 'approved'
  group by group_id, from_user_id
) so on so.group_id = m.group_id and so.user_id = m.user_id
left join (
  select group_id, to_user_id as user_id, sum(amount_paise)::bigint as received
  from public.settlements
  where status = 'approved'
  group by group_id, to_user_id
) si on si.group_id = m.group_id and si.user_id = m.user_id
where m.left_at is null;

-- Joining with a code brings back someone who left earlier.
create or replace function public.preview_invite(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv public.invites%rowtype;
  gname text;
  members int;
  me uuid := auth.uid();
begin
  select * into inv from public.invites where code = upper(trim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'invalid');
  end if;
  if inv.expires_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  select name into gname from public.groups where id = inv.group_id;
  select count(*) into members from public.group_members where group_id = inv.group_id and left_at is null;
  return jsonb_build_object(
    'valid', true,
    'reason', case when me is not null and public.is_group_member(inv.group_id, me) then 'already_member' else null end,
    'group_id', inv.group_id,
    'group_name', gname,
    'expires_at', inv.expires_at,
    'member_count', members
  );
end;
$$;

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
  select * into inv from public.invites where code = upper(trim(coalesce(p_code, '')));
  if not found then
    raise exception 'This invite is invalid';
  end if;
  if inv.expires_at <= now() then
    raise exception 'This invite has expired';
  end if;
  if public.is_group_member(inv.group_id, me) then
    return inv.group_id;
  end if;
  update public.group_members
    set left_at = null, role = 'member', joined_at = now()
    where group_id = inv.group_id and user_id = me;
  if not found then
    insert into public.group_members (group_id, user_id, role)
    values (inv.group_id, me, 'member');
  end if;
  return inv.group_id;
end;
$$;

-- Why this person cannot leave right now, or null when they can.
create or replace function public.member_exit_block(p_group_id uuid, p_user_id uuid, p_self boolean)
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

revoke all on function public.member_exit_block(uuid, uuid, boolean) from public;

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
  update public.group_members set left_at = now() where group_id = p_group_id and user_id = me;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  blocked text;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  blocked := public.member_exit_block(p_group_id, p_user_id, p_user_id = auth.uid());
  if blocked is not null then
    raise exception '%', blocked;
  end if;
  update public.group_members set left_at = now() where group_id = p_group_id and user_id = p_user_id;
end;
$$;

revoke all on function public.leave_group(uuid) from public;
grant execute on function public.leave_group(uuid) to authenticated;

-- Expenses that involve someone who left cannot be edited or deleted: their balance
-- was settled to zero when they left and must stay that way.
create or replace function public.expense_former_member(p_expense_id uuid, p_group_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.display_name
  from public.profiles p
  where p.id in (
      select payer_id from public.expenses where id = p_expense_id
      union
      select user_id from public.expense_shares where expense_id = p_expense_id and share_paise > 0
    )
    and not exists (
      select 1 from public.group_members m
      where m.group_id = p_group_id and m.user_id = p.id and m.left_at is null
    )
  limit 1;
$$;

revoke all on function public.expense_former_member(uuid, uuid) from public;

create or replace function public.reject_locked_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_d date;
  former text;
begin
  if tg_op <> 'DELETE' and new.expense_date > current_date + 1 then
    raise exception 'Expenses cannot be dated in the future';
  end if;

  if tg_op <> 'INSERT' then
    former := public.expense_former_member(old.id, old.group_id);
    if former is not null then
      raise exception '% left the group, so this expense can no longer be changed', former;
    end if;
  end if;

  lock_d := public.group_lock_date(coalesce(old.group_id, new.group_id));
  if lock_d is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.expense_date < lock_d then
      raise exception 'Expenses before % are locked by a settlement', to_char(lock_d, 'DD Mon YYYY');
    end if;
    return new;
  end if;

  if public.expense_is_locked(old.group_id, old.expense_date, old.created_at) then
    raise exception 'Expenses on or before % are locked by a settlement', to_char(lock_d, 'DD Mon YYYY');
  end if;
  if tg_op = 'UPDATE' and new.expense_date < lock_d then
    raise exception 'Expenses before % are locked by a settlement', to_char(lock_d, 'DD Mon YYYY');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
