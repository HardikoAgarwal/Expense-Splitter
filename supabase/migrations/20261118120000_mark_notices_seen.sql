-- Mark several (or all) of the caller's share notices as seen in one call.
-- Activity marks notices seen as they scroll into view, and "Mark all as seen"
-- passes null to clear everything. Only the caller's own unseen notices change.
create or replace function public.mark_notices_seen(p_notice_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  changed integer;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;
  update public.share_notices
    set seen_at = now()
    where user_id = me
      and seen_at is null
      and (p_notice_ids is null or id = any (p_notice_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_notices_seen(uuid[]) from public;
grant execute on function public.mark_notices_seen(uuid[]) to authenticated;
