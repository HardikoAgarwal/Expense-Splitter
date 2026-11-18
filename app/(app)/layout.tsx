import { redirect } from "next/navigation"

import { Shell } from "@/components/shell"
import { countUnseenNotices, getSessionUser, listGroups } from "@/lib/queries"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Start every read at once. The proxy already turned away signed-out visitors.
  const [user, groups, unseen] = await Promise.all([getSessionUser(), listGroups(), countUnseenNotices()])
  if (!user) redirect("/login")
  const pending = groups.reduce((sum, group) => sum + group.pendingForMe, 0) + unseen
  return (
    <Shell user={user} groups={groups} pending={pending}>
      {children}
    </Shell>
  )
}
