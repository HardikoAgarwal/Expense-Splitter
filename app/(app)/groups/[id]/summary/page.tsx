import { notFound, redirect } from "next/navigation"

import { SummaryScreen } from "@/components/summary-screen"
import { todayISO } from "@/lib/money"
import { getSessionUser, getSummary } from "@/lib/queries"

export default async function SummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string }>
}) {
  const [{ id }, { month }] = await Promise.all([params, searchParams])
  const [user, summary] = await Promise.all([
    getSessionUser(),
    getSummary(id, month && /^\d{4}-\d{2}/.test(month) ? month : todayISO()),
  ])
  if (!user) redirect("/login")
  if (!summary) notFound()
  return (
    <div className="mx-auto w-full max-w-3xl">
      <SummaryScreen summary={summary} user={user} />
    </div>
  )
}
