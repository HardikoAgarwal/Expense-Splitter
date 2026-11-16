import { redirect } from "next/navigation"

import { Shell } from "@/components/shell"
import { getActivity, getSessionUser, listGroups } from "@/lib/queries"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const [groups, activity] = await Promise.all([listGroups(), getActivity()])
  const pending =
    groups.reduce((sum, group) => sum + group.pendingForMe, 0) +
    activity.notices.filter((notice) => !notice.seen).length
  return (
    <Shell user={user} groups={groups} pending={pending}>
      {children}
    </Shell>
  )
}
