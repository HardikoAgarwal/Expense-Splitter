-- Only the person who added an expense can edit or delete it.
-- Enforced with a trigger so it holds for every path (save_expense, delete_expense,
-- or any future function), not just the app.

create or replace function public.expense_creator_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Server-side jobs and the SQL editor run without a user; let them through.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    -- Deleting a whole group cascades to its expenses; the group row is already gone then.
    if not exists (select 1 from public.groups g where g.id = old.group_id) then
      return old;
    end if;
    if old.created_by <> auth.uid() then
      raise exception 'Only the person who added this expense can edit or delete it';
    end if;
    return old;
  end if;
  if old.created_by <> auth.uid() then
    raise exception 'Only the person who added this expense can edit or delete it';
  end if;
  -- The creator never changes.
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists expenses_creator_only on public.expenses;
create trigger expenses_creator_only
  before update or delete on public.expenses
  for each row execute function public.expense_creator_only();

-- ---------------------------------------------------------------------------
-- Change notices: tell people with a share when an expense is edited or deleted.
-- Existing rows stay 'added' notices. Edited/deleted notices carry a short summary
-- and a snapshot of the description; deleted ones have no expense to point at.
-- They are written by the server with the service role, so no new policies.
-- ---------------------------------------------------------------------------
alter table public.share_notices add column if not exists kind text not null default 'added';
alter table public.share_notices drop constraint if exists share_notices_kind_check;
alter table public.share_notices add constraint share_notices_kind_check check (kind in ('added', 'edited', 'deleted'));
alter table public.share_notices add column if not exists summary text;
alter table public.share_notices add column if not exists description text;
alter table public.share_notices alter column expense_id drop not null;
-- Someone removed from a split, or a deleted expense, has no share left.
alter table public.share_notices drop constraint if exists share_notices_share_paise_check;
alter table public.share_notices add constraint share_notices_share_paise_check check (share_paise >= 0);
