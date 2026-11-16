import { redirect } from "next/navigation"

import { GroupsHome } from "@/components/groups-home"
import { getSessionUser, listGroups } from "@/lib/queries"

export default async function GroupsPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const groups = await listGroups()
  return <GroupsHome user={user} groups={groups} />
}
