import { notFound, redirect } from "next/navigation"

import { GroupScreen } from "@/components/group-screen"
import { getGroup, getSessionUser } from "@/lib/queries"

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const { id } = await params
  const group = await getGroup(id)
  if (!group) notFound()
  return <GroupScreen group={group} user={user} />
}
