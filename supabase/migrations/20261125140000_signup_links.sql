-- Open invite links: a member shares a single-use link and the invitee picks their
-- own name, email and password. Service-role only, like account_invites.
create table if not exists public.signup_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists signup_links_created_by_idx on public.signup_links (created_by);

alter table public.signup_links enable row level security;
revoke all on table public.signup_links from anon, authenticated;
