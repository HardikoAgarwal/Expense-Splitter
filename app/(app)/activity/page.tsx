import { redirect } from "next/navigation"

import { ActivityScreen } from "@/components/activity-screen"
import { getActivity, getSessionUser } from "@/lib/queries"

export default async function ActivityPage() {
  const [user, activity] = await Promise.all([getSessionUser(), getActivity()])
  if (!user) redirect("/login")
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ActivityScreen pending={activity.pending} disputes={activity.disputes} notices={activity.notices} feed={activity.feed} />
    </div>
  )
}
