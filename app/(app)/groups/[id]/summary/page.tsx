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
  const user = await getSessionUser()
  if (!user) redirect("/login")
  const { id } = await params
  const month = (await searchParams).month
  const summary = await getSummary(id, month && /^\d{4}-\d{2}/.test(month) ? month : todayISO())
  if (!summary) notFound()
  return <SummaryScreen summary={summary} user={user} />
}
