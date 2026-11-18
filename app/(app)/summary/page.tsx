import { redirect } from "next/navigation"

import { SummaryView } from "@/components/summary-view"
import { getSessionUser, listGroups, listMyExpenses } from "@/lib/queries"

export const metadata = { title: "Summary" }

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const [user, groups, expenses, { month }] = await Promise.all([
    getSessionUser(),
    listGroups(),
    listMyExpenses(),
    searchParams,
  ])
  if (!user) redirect("/login")
  const people: Record<string, string> = {}
  for (const group of groups) for (const member of group.members) people[member.id] = member.displayName
  return (
    <SummaryView
      eyebrow="Monthly summary"
      title="All groups"
      basePath="/summary"
      expenses={expenses}
      people={people}
      groups={groups.map((group) => ({ id: group.id, name: group.name }))}
      userId={user.id}
      initialMonth={month && /^\d{4}-\d{2}/.test(month) ? `${month.slice(0, 7)}-01` : undefined}
    />
  )
}
