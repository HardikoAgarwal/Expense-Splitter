-- Hissa: shared expenses for a household.
-- Money is integer paise (₹1 = 100). Shares must sum to the expense total.
-- Equal-split remainder goes to the lowest user ids; see split_equally
-- and the matching TypeScript in lib/ledger.ts.
-- net = paid - owed shares + approved settlements paid - approved settlements received.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique check (char_length(code) between 6 and 12),
  created_by uuid not null references public.profiles (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 80),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000000),
  payer_id uuid not null references public.profiles (id),
  expense_date date not null,
  category text check (
    category is null
    or category in ('rent', 'groceries', 'utilities', 'dining', 'transport', 'household', 'other')
  ),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  share_paise bigint not null check (share_paise >= 0),
  primary key (expense_id, user_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id),
  to_user_id uuid not null references public.profiles (id),
  amount_paise bigint not null check (amount_paise > 0 and amount_paise <= 100000000000),
  up_to_date date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_user_id <> to_user_id)
);

create index group_members_user_idx on public.group_members (user_id);
create index expenses_group_date_idx on public.expenses (group_id, expense_date desc);
create index settlements_group_status_idx on public.settlements (group_id, status);
create index invites_code_idx on public.invites (code);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so policies do not recurse)
-- ---------------------------------------------------------------------------

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
  );
$$;

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
      and theirs.user_id = p_user_id
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.display_name := trim(new.display_name);
  if char_length(new.display_name) < 1 or char_length(new.display_name) > 40 then
    raise exception 'Name must be 1–40 characters';
  end if;
  return new;
end;
$$;

create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------------
-- Locks and share totals
-- ---------------------------------------------------------------------------

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
    and status = 'approved';
$$;

create or replace function public.reject_locked_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lock_d date;
begin
  if tg_op = 'UPDATE' then
    lock_d := public.group_lock_date(old.group_id);
    if lock_d is not null and (old.expense_date <= lock_d or new.expense_date <= lock_d) then
      raise exception 'Expenses on or before % are locked by a settlement', to_char(lock_d, 'DD Mon YYYY');
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    lock_d := public.group_lock_date(old.group_id);
    if lock_d is not null and old.expense_date <= lock_d then
      raise exception 'Expenses on or before % are locked by a settlement', to_char(lock_d, 'DD Mon YYYY');
    end if;
    return old;
  else
    lock_d := public.group_lock_date(new.group_id);
    if lock_d is not null and new.expense_date <= lock_d then
      raise exception 'Expenses on or before % are locked by a settlement', to_char(lock_d, 'DD Mon YYYY');
    end if;
    return new;
  end if;
end;
$$;

create trigger expenses_lock
  before insert or update or delete on public.expenses
  for each row execute function public.reject_locked_expense();

create or replace function public.reject_locked_share()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  exp public.expenses%rowtype;
  lock_d date;
  eid uuid;
begin
  eid := coalesce(new.expense_id, old.expense_id);
  select * into exp from public.expenses where id = eid;
  if not found then
    return coalesce(new, old);
  end if;
  lock_d := public.group_lock_date(exp.group_id);
  if lock_d is not null and exp.expense_date <= lock_d then
    raise exception 'Expenses on or before % are locked by a settlement', to_char(lock_d, 'DD Mon YYYY');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger shares_lock
  before insert or update or delete on public.expense_shares
  for each row execute function public.reject_locked_share();

create or replace function public.enforce_share_sum()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  exp_id uuid;
  expected bigint;
  actual bigint;
begin
  if tg_table_name = 'expenses' then
    exp_id := coalesce(new.id, old.id);
  else
    exp_id := coalesce(new.expense_id, old.expense_id);
  end if;
  select amount_paise into expected from public.expenses where id = exp_id;
  if not found then
    return null;
  end if;
  select coalesce(sum(share_paise), 0) into actual
  from public.expense_shares
  where expense_id = exp_id;
  if actual <> expected then
    raise exception 'Shares must add up to the total';
  end if;
  return null;
end;
$$;

create constraint trigger expenses_share_sum
  after insert or update of amount_paise on public.expenses
  deferrable initially deferred
  for each row execute function public.enforce_share_sum();

create constraint trigger expense_shares_sum
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function public.enforce_share_sum();

create or replace function public.guard_settlement_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'This settlement is already resolved';
  end if;
  if new.amount_paise <> old.amount_paise
     or new.from_user_id <> old.from_user_id
     or new.to_user_id <> old.to_user_id
     or new.group_id <> old.group_id
     or new.up_to_date <> old.up_to_date
     or new.created_by <> old.created_by then
    raise exception 'Only the status of a settlement can change';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'Invalid settlement status';
  end if;
  if new.resolved_at is null then
    new.resolved_at := now();
  end if;
  return new;
end;
$$;

create trigger settlements_guard
  before update on public.settlements
  for each row execute function public.guard_settlement_update();

-- ---------------------------------------------------------------------------
-- Equal split. Remainder paise go to the first user ids, sorted ascending.
-- ---------------------------------------------------------------------------

create or replace function public.split_equally(p_total bigint, p_user_ids uuid[])
returns table (user_id uuid, share_paise bigint)
language plpgsql
immutable
set search_path = public
as $$
declare
  ids uuid[];
  n int;
  base bigint;
  remainder bigint;
  i int;
begin
  if p_total is null or p_total <= 0 then
    raise exception 'Amount must be a positive number of paise';
  end if;
  select coalesce(array_agg(distinct uid order by uid), '{}'::uuid[])
    into ids
  from unnest(p_user_ids) as uid
  where uid is not null;
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then
    raise exception 'Choose at least one person';
  end if;
  base := p_total / n;
  remainder := p_total - base * n;
  for i in 1..n loop
    user_id := ids[i];
    share_paise := base + case when i <= remainder then 1 else 0 end;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mutations
-- ---------------------------------------------------------------------------

create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
  trimmed text := trim(coalesce(p_name, ''));
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if char_length(trimmed) < 1 or char_length(trimmed) > 80 then
    raise exception 'Group name must be 1–80 characters';
  end if;
  insert into public.groups (name, created_by)
  values (trimmed, me)
  returning id into gid;
  insert into public.group_members (group_id, user_id, role)
  values (gid, me, 'owner');
  return gid;
end;
$$;

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.create_invite(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  new_code text;
  expires_at timestamptz;
begin
  if me is null or not public.is_group_member(p_group_id, me) then
    raise exception 'You are not in this group';
  end if;
  for i in 1..6 loop
    new_code := public.generate_invite_code();
    exit when not exists (select 1 from public.invites where code = new_code);
  end loop;
  expires_at := now() + interval '7 days';
  insert into public.invites (group_id, code, created_by, expires_at)
  values (p_group_id, new_code, me, expires_at);
  return jsonb_build_object('code', new_code, 'expires_at', expires_at);
end;
$$;

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
  select count(*) into members from public.group_members where group_id = inv.group_id;
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
  insert into public.group_members (group_id, user_id, role)
  values (inv.group_id, me, 'member');
  return inv.group_id;
end;
$$;

create or replace function public.save_expense(
  p_id uuid,
  p_group_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_payer_id uuid,
  p_expense_date date,
  p_category text,
  p_shares jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  eid uuid;
  share jsonb;
  sum_shares bigint := 0;
  uid uuid;
  sp bigint;
  n int := 0;
  distinct_n int;
  desc_text text := trim(coalesce(p_description, ''));
  cat text := nullif(trim(coalesce(p_category, '')), '');
begin
  if me is null or not public.is_group_member(p_group_id, me) then
    raise exception 'You are not in this group';
  end if;
  if char_length(desc_text) < 1 or char_length(desc_text) > 80 then
    raise exception 'Description must be 1–80 characters';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 100000000000 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_expense_date is null then
    raise exception 'Choose a valid date';
  end if;
  if cat is not null and cat not in ('rent', 'groceries', 'utilities', 'dining', 'transport', 'household', 'other') then
    raise exception 'Unknown category';
  end if;
  if not public.is_group_member(p_group_id, p_payer_id) then
    raise exception 'The payer needs to be in the group';
  end if;
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Choose who shares this expense';
  end if;

  for share in select value from jsonb_array_elements(p_shares)
  loop
    if (share.value ->> 'user_id') !~* '^[0-9a-f-]{36}$' or (share.value ->> 'share_paise') !~ '^[0-9]+$' then
      raise exception 'Each share must be zero or more';
    end if;
    uid := (share.value ->> 'user_id')::uuid;
    sp := (share.value ->> 'share_paise')::bigint;
    if not public.is_group_member(p_group_id, uid) then
      raise exception 'Every share must belong to someone in the group';
    end if;
    sum_shares := sum_shares + sp;
    n := n + 1;
  end loop;

  select count(distinct value ->> 'user_id') into distinct_n from jsonb_array_elements(p_shares);
  if distinct_n <> n then
    raise exception 'A person can only appear once';
  end if;
  if sum_shares <> p_amount_paise then
    raise exception 'Shares must add up to the total';
  end if;

  if p_id is null then
    insert into public.expenses (
      group_id, description, amount_paise, payer_id, expense_date, category, created_by
    ) values (
      p_group_id, desc_text, p_amount_paise, p_payer_id, p_expense_date, cat, me
    ) returning id into eid;
  else
    update public.expenses
      set description = desc_text,
          amount_paise = p_amount_paise,
          payer_id = p_payer_id,
          expense_date = p_expense_date,
          category = cat,
          updated_at = now()
      where id = p_id
        and group_id = p_group_id
      returning id into eid;
    if eid is null then
      raise exception 'Expense cannot be edited';
    end if;
    delete from public.expense_shares where expense_id = eid;
  end if;

  insert into public.expense_shares (expense_id, user_id, share_paise)
  select eid, (value ->> 'user_id')::uuid, (value ->> 'share_paise')::bigint
  from jsonb_array_elements(p_shares);

  return eid;
end;
$$;

create or replace function public.delete_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  exp public.expenses%rowtype;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select * into exp from public.expenses where id = p_id;
  if not found or not public.is_group_member(exp.group_id, me) then
    raise exception 'Expense not found';
  end if;
  delete from public.expenses where id = p_id;
end;
$$;

create or replace function public.request_settlement(
  p_group_id uuid,
  p_to uuid,
  p_amount bigint,
  p_up_to date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  sid uuid;
begin
  if me is null or not public.is_group_member(p_group_id, me) then
    raise exception 'You are not in this group';
  end if;
  if p_to = me then
    raise exception 'Pick someone else';
  end if;
  if not public.is_group_member(p_group_id, p_to) then
    raise exception 'That person is not in the group';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero';
  end if;
  if p_up_to is null then
    raise exception 'Choose a valid date';
  end if;
  insert into public.settlements (
    group_id, from_user_id, to_user_id, amount_paise, up_to_date, status, created_by
  ) values (
    p_group_id, me, p_to, p_amount, p_up_to, 'pending', me
  ) returning id into sid;
  return sid;
end;
$$;

create or replace function public.resolve_settlement(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.settlements%rowtype;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select * into row from public.settlements where id = p_id;
  if not found then
    raise exception 'Settlement not found';
  end if;
  if row.to_user_id <> me then
    raise exception 'Only the person being paid can approve or reject';
  end if;
  if row.status <> 'pending' then
    raise exception 'This settlement is already resolved';
  end if;
  update public.settlements
    set status = case when p_approve then 'approved' else 'rejected' end,
        resolved_at = now()
    where id = p_id;
end;
$$;

create or replace function public.cancel_settlement(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.settlements%rowtype;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select * into row from public.settlements where id = p_id;
  if not found then
    raise exception 'Settlement not found';
  end if;
  if row.created_by <> me and row.from_user_id <> me then
    raise exception 'Only the requester can cancel';
  end if;
  if row.status <> 'pending' then
    raise exception 'This settlement is already resolved';
  end if;
  delete from public.settlements where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Balances. Positive net means the group owes this person.
-- ---------------------------------------------------------------------------

create view public.group_member_balances
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
) si on si.group_id = m.group_id and si.user_id = m.user_id;

create or replace function public.group_balances(p_group_id uuid)
returns table (
  user_id uuid,
  paid_paise bigint,
  owed_paise bigint,
  settlements_paid_paise bigint,
  settlements_received_paise bigint,
  net_paise bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'You are not in this group';
  end if;
  return query
  select
    b.user_id,
    b.paid_paise,
    b.owed_paise,
    b.settlements_paid_paise,
    b.settlements_received_paise,
    b.net_paise
  from public.group_member_balances b
  where b.group_id = p_group_id
  order by b.user_id;
end;
$$;

-- Largest debtor matched with the largest creditor. Ties break by user id.
create or replace function public.simplified_debts(p_group_id uuid)
returns table (from_user_id uuid, to_user_id uuid, amount_paise bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  creditors uuid[];
  credit_left bigint[];
  debtors uuid[];
  debt_left bigint[];
  i int := 1;
  j int := 1;
  pay bigint;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'You are not in this group';
  end if;

  select
    coalesce(array_agg(b.user_id order by b.net_paise desc, b.user_id asc), '{}'::uuid[]),
    coalesce(array_agg(b.net_paise order by b.net_paise desc, b.user_id asc), '{}'::bigint[])
  into creditors, credit_left
  from public.group_member_balances b
  where b.group_id = p_group_id
    and b.net_paise > 0;

  select
    coalesce(array_agg(b.user_id order by b.net_paise asc, b.user_id asc), '{}'::uuid[]),
    coalesce(array_agg((-b.net_paise) order by b.net_paise asc, b.user_id asc), '{}'::bigint[])
  into debtors, debt_left
  from public.group_member_balances b
  where b.group_id = p_group_id
    and b.net_paise < 0;

  while i <= coalesce(array_length(debtors, 1), 0)
    and j <= coalesce(array_length(creditors, 1), 0)
  loop
    pay := least(debt_left[i], credit_left[j]);
    if pay > 0 then
      from_user_id := debtors[i];
      to_user_id := creditors[j];
      amount_paise := pay;
      return next;
    end if;
    debt_left[i] := debt_left[i] - pay;
    credit_left[j] := credit_left[j] - pay;
    if debt_left[i] = 0 then
      i := i + 1;
    end if;
    if credit_left[j] = 0 then
      j := j + 1;
    end if;
    if pay = 0 then
      exit;
    end if;
  end loop;
end;
$$;

create or replace function public.pairwise_i_owe(
  p_group_id uuid,
  p_other uuid,
  p_up_to date
) returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_shares bigint;
  their_shares bigint;
  i_paid bigint;
  they_paid bigint;
begin
  if me is null or not public.is_group_member(p_group_id, me) then
    raise exception 'You are not in this group';
  end if;
  if not public.is_group_member(p_group_id, p_other) then
    raise exception 'That person is not in the group';
  end if;

  select coalesce(sum(s.share_paise), 0) into my_shares
  from public.expense_shares s
  join public.expenses e on e.id = s.expense_id
  where e.group_id = p_group_id
    and e.payer_id = p_other
    and s.user_id = me
    and e.expense_date <= p_up_to;

  select coalesce(sum(s.share_paise), 0) into their_shares
  from public.expense_shares s
  join public.expenses e on e.id = s.expense_id
  where e.group_id = p_group_id
    and e.payer_id = me
    and s.user_id = p_other
    and e.expense_date <= p_up_to;

  select coalesce(sum(amount_paise), 0) into i_paid
  from public.settlements
  where group_id = p_group_id
    and status = 'approved'
    and from_user_id = me
    and to_user_id = p_other
    and up_to_date <= p_up_to;

  select coalesce(sum(amount_paise), 0) into they_paid
  from public.settlements
  where group_id = p_group_id
    and status = 'approved'
    and from_user_id = p_other
    and to_user_id = me
    and up_to_date <= p_up_to;

  return my_shares - their_shares - i_paid + they_paid;
end;
$$;

create or replace function public.group_month_totals(p_group_id uuid)
returns table (month_start date, total_paise bigint, my_share_paise bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'You are not in this group';
  end if;
  return query
  select
    date_trunc('month', e.expense_date)::date as month_start,
    sum(e.amount_paise)::bigint as total_paise,
    coalesce(sum(mine.share_paise), 0)::bigint as my_share_paise
  from public.expenses e
  left join public.expense_shares mine
    on mine.expense_id = e.id
   and mine.user_id = auth.uid()
  where e.group_id = p_group_id
  group by 1
  order by 1 desc;
end;
$$;

create or replace function public.group_category_totals(p_group_id uuid, p_month date)
returns table (category text, total_paise bigint)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'You are not in this group';
  end if;
  return query
  select
    coalesce(e.category, 'other') as category,
    sum(e.amount_paise)::bigint as total_paise
  from public.expenses e
  where e.group_id = p_group_id
    and date_trunc('month', e.expense_date)::date = date_trunc('month', p_month)::date
  group by 1
  order by 2 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS. Members read their groups. Writes go through the functions above.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_group(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy groups_select on public.groups
  for select to authenticated
  using (public.is_group_member(id, auth.uid()));

create policy members_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy invites_select on public.invites
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy expenses_select on public.expenses
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

create policy shares_select on public.expense_shares
  for select to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id
        and public.is_group_member(e.group_id, auth.uid())
    )
  );

create policy settlements_select on public.settlements
  for select to authenticated
  using (public.is_group_member(group_id, auth.uid()));

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.groups from anon, authenticated;
revoke all on table public.group_members from anon, authenticated;
revoke all on table public.invites from anon, authenticated;
revoke all on table public.expenses from anon, authenticated;
revoke all on table public.expense_shares from anon, authenticated;
revoke all on table public.settlements from anon, authenticated;
revoke all on table public.group_member_balances from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select on table public.groups to authenticated;
grant select on table public.group_members to authenticated;
grant select on table public.invites to authenticated;
grant select on table public.expenses to authenticated;
grant select on table public.expense_shares to authenticated;
grant select on table public.settlements to authenticated;
grant select on table public.group_member_balances to authenticated;

revoke all on function public.is_group_member(uuid, uuid) from public;
revoke all on function public.shares_group(uuid) from public;
revoke all on function public.group_lock_date(uuid) from public;
revoke all on function public.split_equally(bigint, uuid[]) from public;
revoke all on function public.create_group(text) from public;
revoke all on function public.generate_invite_code() from public;
revoke all on function public.create_invite(uuid) from public;
revoke all on function public.preview_invite(text) from public;
revoke all on function public.join_group_by_code(text) from public;
revoke all on function public.save_expense(uuid, uuid, text, bigint, uuid, date, text, jsonb) from public;
revoke all on function public.delete_expense(uuid) from public;
revoke all on function public.request_settlement(uuid, uuid, bigint, date) from public;
revoke all on function public.resolve_settlement(uuid, boolean) from public;
revoke all on function public.cancel_settlement(uuid) from public;
revoke all on function public.group_balances(uuid) from public;
revoke all on function public.simplified_debts(uuid) from public;
revoke all on function public.pairwise_i_owe(uuid, uuid, date) from public;
revoke all on function public.group_month_totals(uuid) from public;
revoke all on function public.group_category_totals(uuid, date) from public;

grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.shares_group(uuid) to authenticated;
grant execute on function public.split_equally(bigint, uuid[]) to authenticated;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.preview_invite(text) to anon, authenticated;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.save_expense(uuid, uuid, text, bigint, uuid, date, text, jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;
grant execute on function public.request_settlement(uuid, uuid, bigint, date) to authenticated;
grant execute on function public.resolve_settlement(uuid, boolean) to authenticated;
grant execute on function public.cancel_settlement(uuid) to authenticated;
grant execute on function public.group_balances(uuid) to authenticated;
grant execute on function public.simplified_debts(uuid) to authenticated;
grant execute on function public.pairwise_i_owe(uuid, uuid, date) to authenticated;
grant execute on function public.group_month_totals(uuid) to authenticated;
grant execute on function public.group_category_totals(uuid, date) to authenticated;
