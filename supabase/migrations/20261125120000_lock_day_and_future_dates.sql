-- Fix 1: settling "through today" used to lock today for good, so nobody could add
-- an expense dated today afterwards. Days strictly before the settled date stay
-- locked. On the settled date itself only expenses that already existed when the
-- settlement was approved are locked; anything added later is open.
-- Fix 2: reject expenses dated in the future (one day of slack for time zones).

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
    and up_to_date = public.group_lock_date(p_group_id);
$$;

revoke all on function public.group_lock_at(uuid) from public;

create or replace function public.expense_is_locked(p_group_id uuid, p_date date, p_created timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lock_d date := public.group_lock_date(p_group_id);
begin
  if lock_d is null then
    return false;
  end if;
  if p_date < lock_d then
    return true;
  end if;
  if p_date = lock_d then
    return p_created <= public.group_lock_at(p_group_id);
  end if;
  return false;
end;
$$;

revoke all on function public.expense_is_locked(uuid, date, timestamptz) from public;

create or replace function public.reject_locked_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_d date;
begin
  if tg_op <> 'DELETE' and new.expense_date > current_date + 1 then
    raise exception 'Expenses cannot be dated in the future';
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

create or replace function public.reject_locked_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  exp public.expenses%rowtype;
  eid uuid;
begin
  eid := coalesce(new.expense_id, old.expense_id);
  select * into exp from public.expenses where id = eid;
  if not found then
    return coalesce(new, old);
  end if;
  if public.expense_is_locked(exp.group_id, exp.expense_date, exp.created_at) then
    raise exception 'Expenses on or before % are locked by a settlement',
      to_char(public.group_lock_date(exp.group_id), 'DD Mon YYYY');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
