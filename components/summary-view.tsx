"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon, ReceiptTextIcon } from "lucide-react"

import { BackLink } from "@/components/back-link"
import { CategoryIcon } from "@/components/category-icon"
import { Person } from "@/components/person"
import { categoryColor, categoryLabel } from "@/lib/categories"
import { formatINR, formatMonth, formatMonthShort, todayISO } from "@/lib/money"
import { monthOf, shiftMonth, summarizeMonth, trend, type SummaryExpense } from "@/lib/summary"
import { cn } from "@/lib/utils"

export function SummaryView({
  title,
  eyebrow,
  backHref,
  backLabel,
  basePath,
  expenses,
  people,
  groups,
  userId,
  initialMonth,
}: {
  title: string
  eyebrow: string
  backHref?: string
  backLabel?: string
  /** Page path; the month is kept in ?month= so a refresh or share lands on the same month. */
  basePath: string
  expenses: SummaryExpense[]
  people: Record<string, string>
  /** Only for the all-groups view. */
  groups?: { id: string; name: string }[]
  userId: string
  initialMonth?: string
}) {
  const [month, setMonth] = useState(monthOf(initialMonth ?? todayISO()))
  const summary = useMemo(() => summarizeMonth(expenses, userId, month), [expenses, userId, month])
  const points = useMemo(() => trend(summary.months, month, 6), [summary.months, month])
  const currentMonth = monthOf(todayISO())
  const nameOf = (id: string) => (id === userId ? "You" : (people[id] ?? "Someone"))

  function choose(next: string) {
    setMonth(next)
    window.history.replaceState(null, "", `${basePath}?month=${next.slice(0, 7)}`)
  }

  const peak = Math.max(...points.map((point) => point.totalPaise), 1)
  const topCategories = summary.categories.slice(0, 5)
  const topCategory = Math.max(...topCategories.map((item) => item.totalPaise), 1)
  const topPayer = Math.max(...summary.payers.map((item) => item.paidPaise), 1)
  const sharePct = summary.totalPaise > 0 ? Math.round((summary.mySharePaise / summary.totalPaise) * 100) : 0
  const net = summary.myPaidPaise - summary.mySharePaise

  return (
    <div className="px-4 pt-4 pb-6 md:px-0 md:pt-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {backHref ? (
            <div>
              <BackLink href={backHref} label={backLabel ?? "Back"} />
            </div>
          ) : null}
          <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
          <h1 className="mt-1 truncate text-[1.75rem] font-semibold tracking-tight md:text-[2.1rem]">{title}</h1>
        </div>
        <div className="flex items-center gap-1 rounded-[12px] bg-card p-1 ring-1 ring-border" role="group" aria-label="Month">
          <button
            type="button"
            onClick={() => choose(shiftMonth(month, -1))}
            className="flex size-10 items-center justify-center rounded-[10px] hover:bg-muted"
          >
            <ChevronLeftIcon className="size-5" />
            <span className="sr-only">Previous month</span>
          </button>
          <label htmlFor="summary-month" className="sr-only">
            Choose month
          </label>
          <select
            id="summary-month"
            value={month}
            onChange={(event) => choose(event.target.value)}
            className="h-10 min-w-36 flex-1 rounded-[10px] bg-transparent px-2 text-center text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {summary.months.map((point) => (
              <option key={point.monthStart} value={point.monthStart}>
                {formatMonth(point.monthStart)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={month >= currentMonth}
            onClick={() => choose(shiftMonth(month, 1))}
            className="flex size-10 items-center justify-center rounded-[10px] hover:bg-muted disabled:opacity-30"
          >
            <ChevronRightIcon className="size-5" />
            <span className="sr-only">Next month</span>
          </button>
        </div>
      </header>

      <section className="gradient-hero mt-5 rounded-[20px] px-5 py-5 text-white md:px-6 md:py-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/75">Spent in {formatMonth(month)}</p>
            <p className="money mt-1 text-[2.75rem] leading-none tracking-tight">{formatINR(summary.totalPaise)}</p>
            <p className="mt-2 text-sm text-white/70">
              {summary.count} {summary.count === 1 ? "expense" : "expenses"}
              {summary.totalPaise > 0 ? ` · your share ${sharePct}%` : null}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-stretch gap-0 border-t border-white/20 pt-4">
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-sm text-white/70">Your share</p>
            <p className="money mt-1 text-[1.5rem] leading-none">{formatINR(summary.mySharePaise)}</p>
          </div>
          <div className="w-px shrink-0 self-stretch bg-white/20" aria-hidden />
          <div className="min-w-0 flex-1 pl-4">
            <p className="text-sm text-white/70">You paid</p>
            <p className="money mt-1 text-[1.5rem] leading-none">{formatINR(summary.myPaidPaise)}</p>
            <p className="mt-1.5 text-xs text-white/65">
              {net === 0
                ? "Even with your share"
                : net > 0
                  ? `${formatINR(net)} more than share`
                  : `${formatINR(Math.abs(net))} less than share`}
            </p>
          </div>
        </div>
      </section>

      {summary.count === 0 ? (
        <div className="mt-5 flex flex-col items-center rounded-[16px] bg-card px-6 py-10 text-center ring-1 ring-border">
          <span className="flex size-12 items-center justify-center rounded-[14px] bg-accent text-accent-foreground">
            <ReceiptTextIcon className="size-5" />
          </span>
          <p className="mt-3 font-semibold">Nothing spent in {formatMonth(month)}</p>
          <p className="mt-1 text-sm text-muted-foreground">Pick another month, or add an expense to see it here.</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card title="Spend by category">
            <ul className="space-y-3">
              {topCategories.map((item) => {
                const percent = Math.round((item.totalPaise / summary.totalPaise) * 100)
                return (
                  <li key={item.category} className="flex items-center gap-3">
                    <CategoryIcon category={item.category} className="size-9 rounded-[10px] [&_svg]:size-4" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">
                          {categoryLabel(item.category === "other" ? null : item.category)}
                        </span>
                        <span className="money shrink-0">{formatINR(item.totalPaise)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(4, (item.totalPaise / topCategory) * 100)}%`,
                              background: categoryColor(item.category),
                            }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs text-muted-foreground">{percent}%</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Your share {formatINR(item.mySharePaise)}
                        {item.count > 0
                          ? ` · ${item.count} ${item.count === 1 ? "expense" : "expenses"}`
                          : ""}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            {summary.categories.length > topCategories.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                +{summary.categories.length - topCategories.length} more{" "}
                {summary.categories.length - topCategories.length === 1 ? "category" : "categories"}
              </p>
            ) : null}
          </Card>

          <Card title="Top payers">
            <ul className="space-y-3">
              {summary.payers.map((payer) => (
                <li key={payer.userId} className="flex items-center gap-3">
                  <Person id={payer.userId} name={people[payer.userId] ?? "Someone"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{nameOf(payer.userId)}</span>
                      <span className="money shrink-0">{formatINR(payer.paidPaise)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="gradient-primary h-full rounded-full" style={{ width: `${Math.max(4, (payer.paidPaise / topPayer) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Paid for {payer.count} {payer.count === 1 ? "expense" : "expenses"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {groups && summary.groups.length > 1 ? (
            <Card title="By group">
              <ul className="divide-y">
                {summary.groups.map((slice) => (
                  <li key={slice.groupId}>
                    <Link
                      href={`/groups/${slice.groupId}/summary?month=${month.slice(0, 7)}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:text-primary"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {groups.find((group) => group.id === slice.groupId)?.name ?? "Group"}
                        </span>
                        <span className="text-xs text-muted-foreground">Your share {formatINR(slice.mySharePaise)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="money">{formatINR(slice.totalPaise)}</span>
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}

      <div className="mt-5">
        <Card title="Last 6 months">
          <div className="flex h-40 items-end gap-2 sm:gap-4" role="list" aria-label="Spending per month">
            {points.map((point) => {
              const selected = point.monthStart === month
              return (
                <button
                  key={point.monthStart}
                  type="button"
                  role="listitem"
                  onClick={() => choose(point.monthStart)}
                  aria-label={`${formatMonth(point.monthStart)}: ${formatINR(point.totalPaise)}, your share ${formatINR(point.mySharePaise)}`}
                  aria-current={selected ? "date" : undefined}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span className={cn("text-[10px] font-medium text-muted-foreground", selected && "text-foreground")}>
                    {point.totalPaise > 0 ? formatINR(point.totalPaise).replace(/\.\d+$/, "") : ""}
                  </span>
                  <span
                    className={cn(
                      "relative w-full max-w-12 overflow-hidden rounded-t-[8px] bg-primary/20 transition group-hover:bg-primary/30",
                      selected && "bg-primary/35",
                    )}
                    style={{ height: `${Math.max(3, (point.totalPaise / peak) * 100)}%` }}
                  >
                    <span
                      className={cn("absolute inset-x-0 bottom-0 rounded-t-[6px] bg-primary/60", selected && "gradient-primary")}
                      style={{ height: point.totalPaise ? `${(point.mySharePaise / point.totalPaise) * 100}%` : 0 }}
                    />
                  </span>
                  <span className={cn("text-xs text-muted-foreground", selected && "font-semibold text-foreground")}>
                    {formatMonthShort(point.monthStart)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-primary/25" /> Total
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-primary/70" /> Your share
            </span>
          </p>
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[16px] bg-card p-4 ring-1 ring-border md:p-5">
      <h2 className="mb-4 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}
