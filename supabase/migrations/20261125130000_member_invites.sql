-- Members can invite people to the app. Record who sent each invite so a
-- per-member cap can be enforced (admins are exempt). Table stays service-role only.
alter table public.account_invites
  add column if not exists invited_by uuid references public.profiles (id) on delete set null;

create index if not exists account_invites_invited_by_idx on public.account_invites (invited_by);
