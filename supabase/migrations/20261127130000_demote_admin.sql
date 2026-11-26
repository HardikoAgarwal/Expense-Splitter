-- Let an admin step another admin (or themselves) back down to a member.
create or replace function public.demote_group_member(p_group_id uuid, p_user_id uuid)
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
    where group_id = p_group_id and user_id = p_user_id and left_at is null;
  if target_role is null then
    raise exception 'That person is not in the group';
  end if;
  if target_role <> 'admin' then
    raise exception 'They are not an admin';
  end if;
  select count(*) into admins from public.group_members
    where group_id = p_group_id and role = 'admin' and left_at is null;
  if admins <= 1 then
    raise exception 'A group needs at least one admin';
  end if;
  update public.group_members set role = 'member'
    where group_id = p_group_id and user_id = p_user_id;
end;
$$;

revoke all on function public.demote_group_member(uuid, uuid) from public;
grant execute on function public.demote_group_member(uuid, uuid) to authenticated;
