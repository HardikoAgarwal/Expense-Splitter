"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { categoryLabel } from "@/lib/categories"
import { formatINR, formatMonth } from "@/lib/money"
import type { GroupSummary, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"

export function SummaryScreen({
  summary,
  user,
}: {
  summary: GroupSummary
  user: SessionUser
}) {
  const router = useRouter()
  const index = summary.months.findIndex((month) => month.monthStart === summary.monthStart)
  const newer = index > 0 ? summary.months[index - 1] : null
  const older = index >= 0 && index < summary.months.length - 1 ? summary.months[index + 1] : null
  const max = Math.max(...summary.months.find((month) => month.monthStart === summary.monthStart)?.categories.map((item) => item.totalPaise) ?? [1], 1)
  const net = summary.myNetPaise

  function go(month: string) {
    router.push(`/groups/${summary.group.id}/summary?month=${month}`)
  }

  return (
    <div className="px-4 pt-[max(0.6rem,env(safe-area-inset-top))]">
      <Link href={`/groups/${summary.group.id}`} className="flex size-11 items-center justify-center rounded-full active:bg-muted">
        <ArrowLeftIcon className="size-5" />
        <span className="sr-only">Back</span>
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" disabled={!older} onClick={() => older && go(older.monthStart)} className="flex size-11 items-center justify-center rounded-full disabled:opacity-30">
          <ChevronLeftIcon />
        </button>
        <h1 className="text-lg font-semibold">{formatMonth(summary.monthStart)}</h1>
        <button type="button" disabled={!newer} onClick={() => newer && go(newer.monthStart)} className="flex size-11 items-center justify-center rounded-full disabled:opacity-30">
          <ChevronRightIcon />
        </button>
      </div>

      <section className="gradient-hero mt-5 rounded-[16px] px-5 py-5 text-white">
        <p className="text-sm text-white/75">Group spent</p>
        <p className="money mt-1 text-[2.6rem] leading-none">{formatINR(summary.groupTotalPaise)}</p>
        <p className="mt-3 text-sm text-white/85">Your share {formatINR(summary.mySharePaise)}</p>
      </section>

      <section className="mt-3 rounded-[16px] bg-card px-4 py-4 ring-1 ring-border">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your balance, all time</p>
        <p className={cn("money mt-1 text-3xl", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "")}>
          {formatINR(net, { signed: true })}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {net > 0 ? "The group owes you." : net < 0 ? "You owe the group." : "You are square."}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Who pays whom</h2>
        {summary.debts.length === 0 ? (
          <p className="mt-2 text-sm">No payments outstanding.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {summary.debts.map((debt) => {
              const from = summary.group.members.find((member) => member.id === debt.fromUserId)?.displayName.split(" ")[0]
              const to = summary.group.members.find((member) => member.id === debt.toUserId)?.displayName.split(" ")[0]
              return (
                <li key={`${debt.fromUserId}-${debt.toUserId}`} className="flex items-center justify-between rounded-[12px] bg-card px-4 py-3 ring-1 ring-border">
                  <span className="text-sm font-medium">
                    {debt.fromUserId === user.id ? "You" : from} pay{debt.fromUserId === user.id ? "" : "s"} {debt.toUserId === user.id ? "you" : to}
                  </span>
                  <span className="money text-lg">{formatINR(debt.amountPaise)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Categories</h2>
        <div className="mt-3 space-y-3">
          {(summary.months.find((month) => month.monthStart === summary.monthStart)?.categories ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses this month.</p>
          ) : (
            summary.months
              .find((month) => month.monthStart === summary.monthStart)!
              .categories.map((item) => (
                <div key={item.category}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{categoryLabel(item.category)}</span>
                    <span className="font-medium">{formatINR(item.totalPaise)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, (item.totalPaise / max) * 100)}%` }} />
                  </div>
                </div>
              ))
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Every month</h2>
        <div className="mt-2 divide-y overflow-hidden rounded-[16px] bg-card ring-1 ring-border">
          {summary.months.map((month) => (
            <button
              key={month.monthStart}
              type="button"
              onClick={() => go(month.monthStart)}
              className={cn(
                "flex w-full items-center justify-between px-4 py-3 text-left",
                month.monthStart === summary.monthStart && "bg-accent",
              )}
            >
              <span>
                <span className="block text-sm font-medium">{formatMonth(month.monthStart)}</span>
                <span className="text-xs text-muted-foreground">Your share {formatINR(month.mySharePaise)}</span>
              </span>
              <span className="money text-lg">{formatINR(month.totalPaise)}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
