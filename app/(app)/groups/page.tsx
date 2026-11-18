import { redirect } from "next/navigation"

import { GroupsHome } from "@/components/groups-home"
import { countUnseenNotices, getSessionUser, listGroups } from "@/lib/queries"

export default async function GroupsPage() {
  // Both reads are cached per request and shared with the app layout.
  const [user, groups, unseen] = await Promise.all([getSessionUser(), listGroups(), countUnseenNotices()])
  if (!user) redirect("/login")
  return <GroupsHome user={user} groups={groups} unseen={unseen} />
}
