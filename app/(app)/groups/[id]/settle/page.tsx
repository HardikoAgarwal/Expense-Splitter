import { notFound, redirect } from "next/navigation"

import { SettleScreen } from "@/components/settle-screen"
import { getGroup, getSessionUser } from "@/lib/queries"

export default async function SettlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const group = await getGroup((await params).id)
  if (!group) notFound()
  return <SettleScreen group={group} user={user} />
}
