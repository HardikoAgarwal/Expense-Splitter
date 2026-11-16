-- Group creator is that group's admin. Only an admin manages people and invites.

alter table public.group_members drop constraint if exists group_members_role_check;
update public.group_members set role = 'admin' where role = 'owner';
alter table public.group_members
  add constraint group_members_role_check check (role in ('admin', 'member'));

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
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
      and role = 'admin'
  );
$$;

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
  insert into public.groups (name, created_by) values (trimmed, me) returning id into gid;
  insert into public.group_members (group_id, user_id, role) values (gid, me, 'admin');
  return gid;
end;
$$;

create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := trim(coalesce(p_name, ''));
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  if char_length(trimmed) < 1 or char_length(trimmed) > 80 then
    raise exception 'Group name must be 1–80 characters';
  end if;
  update public.groups set name = trimmed where id = p_group_id;
end;
$$;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  delete from public.groups where id = p_group_id;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
  admins int;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  select role into target_role from public.group_members
    where group_id = p_group_id and user_id = p_user_id;
  if target_role is null then
    raise exception 'That person is not in the group';
  end if;
  select count(*) into admins from public.group_members
    where group_id = p_group_id and role = 'admin';
  if target_role = 'admin' and admins <= 1 then
    raise exception 'A group needs at least one admin';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.promote_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_role text;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  select role into target_role from public.group_members
    where group_id = p_group_id and user_id = p_user_id;
  if target_role is null then
    raise exception 'That person is not in the group';
  end if;
  if target_role = 'admin' then
    raise exception 'They are already an admin';
  end if;
  update public.group_members set role = 'admin'
    where group_id = p_group_id and user_id = p_user_id;
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
  if me is null or not public.is_group_admin(p_group_id, me) then
    raise exception 'Only a group admin can do that';
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

create or replace function public.regenerate_invite(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  delete from public.invites where group_id = p_group_id;
  return public.create_invite(p_group_id);
end;
$$;

create or replace function public.revoke_invites(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only a group admin can do that';
  end if;
  delete from public.invites where group_id = p_group_id;
end;
$$;

revoke all on function public.is_group_admin(uuid, uuid) from public;
revoke all on function public.rename_group(uuid, text) from public;
revoke all on function public.delete_group(uuid) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.promote_group_member(uuid, uuid) from public;
revoke all on function public.regenerate_invite(uuid) from public;
revoke all on function public.revoke_invites(uuid) from public;
grant execute on function public.is_group_admin(uuid, uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.promote_group_member(uuid, uuid) to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;
grant execute on function public.revoke_invites(uuid) to authenticated;
