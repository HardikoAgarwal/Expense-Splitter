import { redirect } from "next/navigation"

import { ActivityScreen } from "@/components/activity-screen"
import { getActivity, getSessionUser } from "@/lib/queries"

export default async function ActivityPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const activity = await getActivity()
  return <ActivityScreen pending={activity.pending} notices={activity.notices} feed={activity.feed} />
}
