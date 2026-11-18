import { notFound, redirect } from "next/navigation"

import { SummaryView } from "@/components/summary-view"
import { getGroup, getSessionUser } from "@/lib/queries"

export default async function GroupSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const [{ id }, { month }] = await Promise.all([params, searchParams])
  const [user, group] = await Promise.all([getSessionUser(), getGroup(id)])
  if (!user) redirect("/login")
  if (!group) notFound()
  const people = Object.fromEntries(group.members.map((member) => [member.id, member.displayName]))
  return (
    <SummaryView
      eyebrow="Monthly summary"
      title={group.name}
      backHref={`/groups/${group.id}`}
      basePath={`/groups/${group.id}/summary`}
      expenses={group.expenses}
      people={people}
      userId={user.id}
      initialMonth={month && /^\d{4}-\d{2}/.test(month) ? `${month.slice(0, 7)}-01` : undefined}
    />
  )
}
