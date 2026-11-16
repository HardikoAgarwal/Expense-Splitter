-- Invite-only access. Public sign-up is disabled in supabase/config.toml.
-- The admin creates every account. A person can sign in only when invited
-- and not disabled. Clients cannot change these flags; the service role can,
-- because auth.uid() is null on those requests.

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists disabled boolean not null default false,
  add column if not exists invited boolean not null default false;

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

create table if not exists public.account_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.account_invites enable row level security;
revoke all on table public.account_invites from anon, authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin
      and not disabled
  );
$$;

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
  if auth.uid() is not null then
    new.is_admin := old.is_admin;
    new.disabled := old.disabled;
    new.invited := old.invited;
  end if;
  if char_length(new.display_name) < 1 or char_length(new.display_name) > 40 then
    raise exception 'Name must be 1–40 characters';
  end if;
  return new;
end;
$$;

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select to authenticated
  using (public.is_app_admin());

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- First admin, after that person has signed up or been seeded:
-- update public.profiles set is_admin = true, invited = true where lower(email) = lower('ADMIN_EMAIL');
