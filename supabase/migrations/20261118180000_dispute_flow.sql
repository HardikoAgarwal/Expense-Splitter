-- Dispute flow
-- * Anyone with a share, except the person who added the expense, can flag it.
-- * The person who added it (or the payer) fixes it and asks the flagger to resolve.
-- * Only the flagger can resolve it, or answer "still wrong" to send it back.
-- * Every step leaves a history row and an Activity notice for the other side.
-- * Editing an expense no longer closes its disputes.
-- Needs 20261118160000_expense_owner_and_change_notices.sql (share_notices.kind) first.

alter table public.expense_flags add column if not exists awaiting text not null default 'creator';
alter table public.expense_flags drop constraint if exists expense_flags_awaiting_check;
alter table public.expense_flags add constraint expense_flags_awaiting_check check (awaiting in ('creator', 'flagger'));

create table if not exists public.expense_flag_events (
  id uuid primary key default gen_random_uuid(),
  flag_id uuid not null references public.expense_flags (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('flagged', 'resolve_requested', 'still_wrong', 'resolved')),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists expense_flag_events_flag_idx on public.expense_flag_events (flag_id, created_at);

alter table public.expense_flag_events enable row level security;

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
    )
  );

-- Give flags raised before this migration their opening history row.
insert into public.expense_flag_events (flag_id, actor_id, kind, note, created_at)
select f.id, f.user_id, 'flagged', f.reason, f.created_at
from public.expense_flags f
where not exists (select 1 from public.expense_flag_events ev where ev.flag_id = f.id);

alter table public.share_notices drop constraint if exists share_notices_kind_check;
alter table public.share_notices add constraint share_notices_kind_check
  check (kind in ('added', 'edited', 'deleted', 'flagged', 'resolve_requested', 'still_wrong', 'resolved'));

-- Internal: one Activity notice about a dispute step. Never to yourself.
create or replace function public.dispute_notice(p_user uuid, p_actor uuid, p_expense_id uuid, p_kind text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  exp public.expenses%rowtype;
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  select * into exp from public.expenses where id = p_expense_id;
  if not found then
    return;
  end if;
  insert into public.share_notices (user_id, expense_id, group_id, actor_id, share_paise, kind, summary, description)
  values (p_user, exp.id, exp.group_id, p_actor, 0, p_kind, p_note, exp.description);
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
  my_share bigint;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  fid uuid;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'Keep the note under 200 characters';
  end if;
  select * into exp from public.expenses where id = p_expense_id;
  if not found or not public.is_group_member(exp.group_id, me) then
    raise exception 'Expense not found';
  end if;
  if exp.created_by = me then
    raise exception 'You added this expense. Edit it instead of flagging it';
  end if;
  select share_paise into my_share
  from public.expense_shares
  where expense_id = p_expense_id and user_id = me;
  if my_share is null or my_share <= 0 then
    raise exception 'Only someone with a share can flag this';
  end if;
  select id into fid
  from public.expense_flags
  where expense_id = p_expense_id and user_id = me and resolved_at is null;
  if fid is not null then
    update public.expense_flags set reason = v_reason, awaiting = 'creator' where id = fid;
  else
    insert into public.expense_flags (expense_id, user_id, reason)
    values (p_expense_id, me, v_reason)
    returning id into fid;
  end if;
  insert into public.expense_flag_events (flag_id, actor_id, kind, note) values (fid, me, 'flagged', v_reason);
  perform public.dispute_notice(exp.created_by, me, exp.id, 'flagged', v_reason);
  if exp.payer_id <> exp.created_by then
    perform public.dispute_notice(exp.payer_id, me, exp.id, 'flagged', v_reason);
  end if;
  return fid;
end;
$$;

create or replace function public.request_flag_resolution(p_flag_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  flag public.expense_flags%rowtype;
  exp public.expenses%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Keep the note under 200 characters';
  end if;
  select * into flag from public.expense_flags where id = p_flag_id and resolved_at is null for update;
  if not found then
    raise exception 'That dispute is already resolved';
  end if;
  select * into exp from public.expenses where id = flag.expense_id;
  if me <> exp.created_by and me <> exp.payer_id then
    raise exception 'Only the person who added or paid for this expense can ask';
  end if;
  if flag.awaiting = 'flagger' then
    raise exception 'Already asked. Waiting for them to reply';
  end if;
  update public.expense_flags set awaiting = 'flagger' where id = p_flag_id;
  insert into public.expense_flag_events (flag_id, actor_id, kind, note) values (p_flag_id, me, 'resolve_requested', v_note);
  perform public.dispute_notice(flag.user_id, me, exp.id, 'resolve_requested', v_note);
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
  exp public.expenses%rowtype;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  select * into flag from public.expense_flags where id = p_flag_id and resolved_at is null for update;
  if not found then
    raise exception 'That dispute is already resolved';
  end if;
  if me <> flag.user_id then
    raise exception 'Only the person who flagged it can resolve it';
  end if;
  select * into exp from public.expenses where id = flag.expense_id;
  update public.expense_flags set resolved_at = now(), resolved_by = me where id = p_flag_id;
  insert into public.expense_flag_events (flag_id, actor_id, kind) values (p_flag_id, me, 'resolved');
  perform public.dispute_notice(exp.created_by, me, exp.id, 'resolved', null);
  if exp.payer_id <> exp.created_by then
    perform public.dispute_notice(exp.payer_id, me, exp.id, 'resolved', null);
  end if;
end;
$$;

create or replace function public.reject_flag_resolution(p_flag_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  flag public.expense_flags%rowtype;
  exp public.expenses%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'Keep the note under 200 characters';
  end if;
  select * into flag from public.expense_flags where id = p_flag_id and resolved_at is null for update;
  if not found then
    raise exception 'That dispute is already resolved';
  end if;
  if me <> flag.user_id then
    raise exception 'Only the person who flagged it can answer';
  end if;
  if flag.awaiting <> 'flagger' then
    raise exception 'They haven''t asked you to resolve it yet';
  end if;
  select * into exp from public.expenses where id = flag.expense_id;
  update public.expense_flags set awaiting = 'creator' where id = p_flag_id;
  insert into public.expense_flag_events (flag_id, actor_id, kind, note) values (p_flag_id, me, 'still_wrong', v_note);
  perform public.dispute_notice(exp.created_by, me, exp.id, 'still_wrong', v_note);
  if exp.payer_id <> exp.created_by then
    perform public.dispute_notice(exp.payer_id, me, exp.id, 'still_wrong', v_note);
  end if;
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
    -- Editing no longer closes disputes: the flagger decides, after being asked.
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

revoke all on function public.dispute_notice(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.flag_expense(uuid, text) from public;
revoke all on function public.request_flag_resolution(uuid, text) from public;
revoke all on function public.resolve_expense_flag(uuid) from public;
revoke all on function public.reject_flag_resolution(uuid, text) from public;
grant execute on function public.flag_expense(uuid, text) to authenticated;
grant execute on function public.request_flag_resolution(uuid, text) to authenticated;
grant execute on function public.resolve_expense_flag(uuid) to authenticated;
grant execute on function public.reject_flag_resolution(uuid, text) to authenticated;
