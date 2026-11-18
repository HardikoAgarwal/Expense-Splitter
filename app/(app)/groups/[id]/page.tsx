import { notFound, redirect } from "next/navigation"

import { GroupScreen } from "@/components/group-screen"
import { getGroup, getSessionUser } from "@/lib/queries"

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, group] = await Promise.all([getSessionUser(), getGroup(id)])
  if (!user) redirect("/login")
  if (!group) notFound()
  return <GroupScreen group={group} user={user} />
}
