-- UPI IDs on profiles and Web Push subscriptions.

-- ---------------------------------------------------------------------------
-- UPI ID (optional, like name@bank). Co-members can read it through the
-- existing profiles_select policy; only the owner can change it.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists upi_id text;

alter table public.profiles
  drop constraint if exists profiles_upi_id_format;

alter table public.profiles
  add constraint profiles_upi_id_format
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$');

-- ---------------------------------------------------------------------------
-- Push subscriptions: one row per browser/device. Users manage their own rows;
-- the server reads other users' rows with the service role to send pushes.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

-- A device that changes hands keeps one row: claim the endpoint for the new user.
create or replace function public.save_push_subscription(p_endpoint text, p_keys jsonb, p_user_agent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' then
    raise exception 'Invalid subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, keys, user_agent)
  values (auth.uid(), p_endpoint, p_keys, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        keys = excluded.keys,
        user_agent = excluded.user_agent,
        created_at = now();
end;
$$;

revoke all on function public.save_push_subscription(text, jsonb, text) from public;
grant execute on function public.save_push_subscription(text, jsonb, text) to authenticated;
