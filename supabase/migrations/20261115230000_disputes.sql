-- Share notices and expense flags. A dispute does not change balances.
-- Only a member with a positive share can flag. Only that person, or the
-- expense creator, can resolve it. The creator or payer editing the expense
-- also clears open flags.

create table public.expense_flags (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id)
);

create unique index expense_flags_one_open
  on public.expense_flags (expense_id, user_id)
  where resolved_at is null;

create index expense_flags_expense_idx on public.expense_flags (expense_id);

create table public.share_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  share_paise bigint not null check (share_paise > 0),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index share_notices_user_idx on public.share_notices (user_id) where seen_at is null;

alter table public.expense_flags enable row level security;
alter table public.share_notices enable row level security;

create policy expense_flags_select on public.expense_flags
  for select to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      join public.group_members m on m.group_id = e.group_id
      where e.id = expense_id
        and m.user_id = auth.uid()
    )
  );

create policy share_notices_select on public.share_notices
  for select to authenticated
  using (user_id = auth.uid());

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
  positive int := 0;
  distinct_n int;
  desc_text text := trim(coalesce(p_description, ''));
  cat text := nullif(trim(coalesce(p_category, '')), '');
  old_payer uuid;
  creator uuid;
  old_shares jsonb := '{}'::jsonb;
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
    if sp > 0 then
      positive := positive + 1;
    end if;
  end loop;

  select count(distinct value ->> 'user_id') into distinct_n from jsonb_array_elements(p_shares);
  if distinct_n <> n then
    raise exception 'A person can only appear once';
  end if;
  if positive = 0 then
    raise exception 'Choose who shares this expense';
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
    creator := me;
    old_payer := me;
  else
    select created_by, payer_id into creator, old_payer
    from public.expenses
    where id = p_id and group_id = p_group_id;
    if creator is null then
      raise exception 'Expense cannot be edited';
    end if;
    select coalesce(jsonb_object_agg(user_id::text, share_paise), '{}'::jsonb)
      into old_shares
      from public.expense_shares
      where expense_id = p_id and share_paise > 0;
    update public.expenses
      set description = desc_text,
          amount_paise = p_amount_paise,
          payer_id = p_payer_id,
          expense_date = p_expense_date,
          category = cat,
          updated_at = now()
      where id = p_id
      returning id into eid;
    delete from public.expense_shares where expense_id = eid;
    if me = creator or me = p_payer_id or me = old_payer then
      update public.expense_flags
        set resolved_at = now(), resolved_by = me
        where expense_id = eid and resolved_at is null;
    end if;
  end if;

  insert into public.expense_shares (expense_id, user_id, share_paise)
  select eid, (value ->> 'user_id')::uuid, (value ->> 'share_paise')::bigint
  from jsonb_array_elements(p_shares)
  where (value ->> 'share_paise')::bigint > 0;

  for share in
    select value from jsonb_array_elements(p_shares)
    where (value ->> 'share_paise')::bigint > 0
  loop
    uid := (share.value ->> 'user_id')::uuid;
    sp := (share.value ->> 'share_paise')::bigint;
    if uid = me then
      continue;
    end if;
    if coalesce((old_shares ->> uid::text)::bigint, 0) = 0 then
      insert into public.share_notices (user_id, expense_id, group_id, actor_id, share_paise)
      values (uid, eid, p_group_id, me, sp);
    end if;
  end loop;

  return eid;
end;
$$;

create or replace function public.flag_expense(p_expense_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  exp public.expenses%rowtype;
  share bigint;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
  fid uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if reason is not null and char_length(reason) > 200 then
    raise exception 'Keep the note under 200 characters';
  end if;
  select * into exp from public.expenses where id = p_expense_id;
  if not found or not public.is_group_member(exp.group_id, me) then
    raise exception 'Expense not found';
  end if;
  select share_paise into share
  from public.expense_shares
  where expense_id = p_expense_id and user_id = me;
  if share is null or share <= 0 then
    raise exception 'Only someone with a share can flag this';
  end if;
  select id into fid
  from public.expense_flags
  where expense_id = p_expense_id and user_id = me and resolved_at is null;
  if fid is not null then
    update public.expense_flags set reason = reason where id = fid;
    return fid;
  end if;
  insert into public.expense_flags (expense_id, user_id, reason)
  values (p_expense_id, me, reason)
  returning id into fid;
  return fid;
end;
$$;

create or replace function public.resolve_expense_flag(p_flag_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  flag public.expense_flags%rowtype;
  creator uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select * into flag from public.expense_flags where id = p_flag_id and resolved_at is null;
  if not found then
    raise exception 'That flag is already resolved';
  end if;
  select created_by into creator from public.expenses where id = flag.expense_id;
  if me <> flag.user_id and me <> creator then
    raise exception 'Only the person who flagged it, or the person who added it, can resolve it';
  end if;
  update public.expense_flags
    set resolved_at = now(), resolved_by = me
    where id = p_flag_id;
end;
$$;

create or replace function public.mark_notice_seen(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  update public.share_notices
    set seen_at = now()
    where id = p_notice_id and user_id = me and seen_at is null;
end;
$$;

revoke all on function public.flag_expense(uuid, text) from public;
revoke all on function public.resolve_expense_flag(uuid) from public;
revoke all on function public.mark_notice_seen(uuid) from public;
grant execute on function public.flag_expense(uuid, text) to authenticated;
grant execute on function public.resolve_expense_flag(uuid) to authenticated;
grant execute on function public.mark_notice_seen(uuid) to authenticated;
