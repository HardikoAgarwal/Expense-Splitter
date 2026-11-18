import { notFound, redirect } from "next/navigation"

import { SettleScreen } from "@/components/settle-screen"
import { getGroup, getSessionUser } from "@/lib/queries"

export default async function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [user, group] = await Promise.all([getSessionUser(), getGroup(id)])
  if (!user) redirect("/login")
  if (!group) notFound()
  return (
    <div className="mx-auto w-full max-w-2xl">
      <SettleScreen group={group} user={user} />
    </div>
  )
}
