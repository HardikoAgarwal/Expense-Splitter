-- Idempotent offline creates: the same client_mutation_id from one user
-- always maps to one expense, so a lost response + retry cannot double-insert.

alter table public.expenses
  add column if not exists client_mutation_id text;

create unique index if not exists expenses_creator_mutation_uidx
  on public.expenses (created_by, client_mutation_id)
  where client_mutation_id is not null;

drop function if exists public.save_expense(uuid, uuid, text, bigint, uuid, date, text, jsonb);

create function public.save_expense(
  p_id uuid,
  p_group_id uuid,
  p_description text,
  p_amount_paise bigint,
  p_payer_id uuid,
  p_expense_date date,
  p_category text,
  p_shares jsonb,
  p_client_mutation_id text default null
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
  mutation_id text := nullif(trim(coalesce(p_client_mutation_id, '')), '');
  v_id uuid := p_id;
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
    if (share ->> 'user_id') !~* '^[0-9a-f-]{36}$' or (share ->> 'share_paise') !~ '^[0-9]+$' then
      raise exception 'Each share must be zero or more';
    end if;
    uid := (share ->> 'user_id')::uuid;
    sp := (share ->> 'share_paise')::bigint;
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

  -- Lost-response retry: same mutation id → same expense (update path below).
  if v_id is null and mutation_id is not null then
    select id into v_id
    from public.expenses
    where created_by = me
      and client_mutation_id = mutation_id
      and group_id = p_group_id;
  end if;

  if v_id is null then
    insert into public.expenses (
      group_id, description, amount_paise, payer_id, expense_date, category, created_by, client_mutation_id
    ) values (
      p_group_id, desc_text, p_amount_paise, p_payer_id, p_expense_date, cat, me, mutation_id
    ) returning id into eid;
    creator := me;
    old_payer := me;
  else
    select created_by, payer_id into creator, old_payer
    from public.expenses
    where id = v_id and group_id = p_group_id;
    if creator is null then
      raise exception 'Expense cannot be edited';
    end if;
    select coalesce(jsonb_object_agg(user_id::text, share_paise), '{}'::jsonb)
      into old_shares
      from public.expense_shares
      where expense_id = v_id and share_paise > 0;
    update public.expenses
      set description = desc_text,
          amount_paise = p_amount_paise,
          payer_id = p_payer_id,
          expense_date = p_expense_date,
          category = cat,
          updated_at = now(),
          client_mutation_id = coalesce(client_mutation_id, mutation_id)
      where id = v_id
      returning id into eid;
    delete from public.expense_shares where expense_id = eid;
  end if;

  insert into public.expense_shares (expense_id, user_id, share_paise)
  select eid, (value ->> 'user_id')::uuid, (value ->> 'share_paise')::bigint
  from jsonb_array_elements(p_shares)
  where (value ->> 'share_paise')::bigint > 0;

  for share in
    select value from jsonb_array_elements(p_shares)
    where (value ->> 'share_paise')::bigint > 0
  loop
    uid := (share ->> 'user_id')::uuid;
    sp := (share ->> 'share_paise')::bigint;
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

revoke all on function public.save_expense(uuid, uuid, text, bigint, uuid, date, text, jsonb, text) from public;
grant execute on function public.save_expense(uuid, uuid, text, bigint, uuid, date, text, jsonb, text) to authenticated;
