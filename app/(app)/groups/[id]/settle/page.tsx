import { notFound, redirect } from "next/navigation"

import { SettleScreen } from "@/components/settle-screen"
import { getGroup, getSessionUser, getUpiIds } from "@/lib/queries"

export default async function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, group, upiIds] = await Promise.all([getSessionUser(), getGroup(id), getUpiIds()])
  if (!user) redirect("/login")
  if (!group) notFound()
  const memberUpi = Object.fromEntries(
    group.members.filter((member) => upiIds[member.id]).map((member) => [member.id, upiIds[member.id]]),
  )
  return (
    <div className="mx-auto w-full max-w-2xl">
      <SettleScreen group={group} user={user} upiIds={memberUpi} />
    </div>
  )
}
