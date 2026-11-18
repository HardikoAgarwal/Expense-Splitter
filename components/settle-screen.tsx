"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { Notice } from "@/components/notice"
import { Person } from "@/components/person"
import { Section } from "@/components/section"
import { ShowList } from "@/components/show-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  cancelSettlementAction,
  requestSettlementAction,
  resolveSettlementAction,
  suggestSettlementAction,
} from "@/lib/actions"
import { disputedExpensesInRange } from "@/lib/disputes"
import { formatDay, formatINR, paiseToInput, rupeesToPaise, todayISO } from "@/lib/money"
import type { GroupDetail, SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export function SettleScreen({ group, user }: { group: GroupDetail; user: SessionUser }) {
  const others = group.members.filter((member) => member.id !== user.id)
  const [otherId, setOtherId] = useState(others[0]?.id ?? "")
  const [upToDate, setUpToDate] = useState(todayISO())
  const [amount, setAmount] = useState("")
  const [owed, setOwed] = useState<number | null>(null)
  const { pending: saving, run } = useAction()
  const resolver = useAction()
  const other = others.find((member) => member.id === otherId)

  useEffect(() => {
    if (!otherId) return
    let cancel = false
    void suggestSettlementAction(group.id, otherId, upToDate).then((result) => {
      if (cancel) return
      if (!result.ok) {
        setOwed(null)
        return
      }
      setOwed(result.data)
      setAmount(result.data > 0 ? paiseToInput(result.data) : "")
    })
    return () => {
      cancel = true
    }
  }, [group.id, otherId, upToDate])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const paise = rupeesToPaise(amount)
    if (!otherId || paise === null || paise <= 0) {
      toast.error("Enter how much you paid")
      return
    }
    run(
      () =>
        requestSettlementAction({
          groupId: group.id,
          toUserId: otherId,
          amountPaise: paise,
          upToDate,
        }),
      { success: "Request sent", onSuccess: () => setAmount("") },
    )
  }

  function resolve(id: string, approve: boolean) {
    resolver.run(() => resolveSettlementAction(id, approve), {
      success: approve ? "Payment approved" : "Payment declined",
    })
  }

  function cancel(id: string) {
    resolver.run(() => cancelSettlementAction(id), { success: "Request cancelled" })
  }

  const incoming = group.settlements.filter((item) => item.status === "pending" && item.toUserId === user.id)
  const disputed = disputedExpensesInRange(group.expenses, upToDate)

  return (
    <div className="px-4 pt-[max(0.6rem,env(safe-area-inset-top))]">
      <Link href={`/groups/${group.id}`} className="flex size-11 items-center justify-center rounded-full active:bg-muted">
        <ArrowLeftIcon className="size-5" />
        <span className="sr-only">Back</span>
      </Link>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight">Settle up</h1>
      <p className="mt-1 text-sm text-muted-foreground">Record a payment. It counts after they approve.</p>

      {others.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Invite someone before you can settle.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {others.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setOtherId(member.id)}
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 rounded-full border pr-3 pl-1.5 text-sm font-medium",
                  otherId === member.id ? "border-primary bg-accent" : "border-border",
                )}
              >
                <Person id={member.id} name={member.displayName} size="sm" />
                {member.displayName.split(" ")[0]}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Expenses through
            </span>
            <Input
              type="date"
              value={upToDate}
              onChange={(event) => setUpToDate(event.target.value)}
              className="h-12 rounded-[12px] px-3 text-base"
            />
          </label>

          <div className="rounded-[16px] bg-card px-4 py-3 text-sm ring-1 ring-border">
            {owed === null ? (
              <p className="text-muted-foreground">Checking what you owe…</p>
            ) : owed > 0 ? (
              <p>
                You owe {other?.displayName.split(" ")[0]} <span className="font-semibold text-negative">{formatINR(owed)}</span> through {formatDay(upToDate)}.
              </p>
            ) : owed < 0 ? (
              <p>
                {other?.displayName.split(" ")[0]} owes you <span className="font-semibold text-positive">{formatINR(Math.abs(owed))}</span>. They can record that payment from their account.
              </p>
            ) : (
              <p>You and {other?.displayName.split(" ")[0]} are square through {formatDay(upToDate)}.</p>
            )}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
              You paid them
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">₹</span>
              <Input
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                className="money h-14 rounded-[12px] pr-3 pl-8 text-2xl"
              />
            </div>
          </label>

          {disputed.length > 0 ? (
            <Notice tone="warning" title="Disputed in this range">
              {disputed.map((expense) => expense.description).join(", ")} still count.
            </Notice>
          ) : (
            <p className="text-sm text-muted-foreground">Approval locks expenses through {formatDay(upToDate)}.</p>
          )}
          <Button type="submit" size="xl" className="w-full" pending={saving}>
            {saving ? "Sending…" : "Request approval"}
          </Button>
        </form>
      )}

      {incoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Needs you</h2>
          <div className="mt-3 space-y-3">
            {incoming.map((item) => {
              const from = group.members.find((member) => member.id === item.fromUserId)
              return (
                <article key={item.id} className="rounded-[16px] bg-card p-4 ring-1 ring-border">
                  <p className="font-medium">{from?.displayName} recorded {formatINR(item.amountPaise)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Through {formatDay(item.upToDate)}.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-11 rounded-[12px]" disabled={resolver.pending} onClick={() => resolve(item.id, false)}>
                      Reject
                    </Button>
                    <Button className="h-11 rounded-[12px]" pending={resolver.pending} onClick={() => resolve(item.id, true)}>
                      Approve
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      <Section title="History">
        <div className="space-y-2">
          {group.settlements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No settlements yet.</p>
          ) : (
            <ShowList
              items={group.settlements}
              limit={4}
              render={(item) => {
              const from = group.members.find((member) => member.id === item.fromUserId)?.displayName.split(" ")[0]
              const to = group.members.find((member) => member.id === item.toUserId)?.displayName.split(" ")[0]
              const mine = item.createdBy === user.id && item.status === "pending"
              return (
                <div key={item.id} className="rounded-[16px] bg-card px-4 py-3 ring-1 ring-border">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {from} to {to}
                      </p>
                      <p className="text-xs text-muted-foreground">Through {formatDay(item.upToDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="money text-lg">{formatINR(item.amountPaise)}</p>
                      <p className={cn("text-xs font-medium capitalize", item.status === "approved" ? "text-positive" : item.status === "rejected" ? "text-negative" : "text-warning")}>
                        {item.status}
                      </p>
                    </div>
                  </div>
                  {mine ? (
                    <button type="button" disabled={resolver.pending} onClick={() => cancel(item.id)} className="mt-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
                      Cancel request
                    </button>
                  ) : null}
                </div>
              )
              }}
            />
          )}
        </div>
      </Section>
    </div>
  )
}
