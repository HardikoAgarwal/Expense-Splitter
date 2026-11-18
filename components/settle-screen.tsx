"use client"

import { useEffect, useId, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { QRCodeSVG } from "qrcode.react"
import { ArrowLeftIcon, CalendarIcon, CheckIcon, CircleCheckIcon, ClockIcon, CopyIcon, SmartphoneIcon } from "lucide-react"
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
import { settleBreakdown } from "@/lib/settle"
import type { GroupDetail, SessionUser } from "@/lib/types"
import { upiPayLink } from "@/lib/upi"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

const DESKTOP = "(min-width: 768px)"
function useDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(DESKTOP)
      query.addEventListener("change", notify)
      return () => query.removeEventListener("change", notify)
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  )
}

export function SettleScreen({
  group,
  user,
  upiIds = {},
}: {
  group: GroupDetail
  user: SessionUser
  /** UPI IDs of members who added one, keyed by user id. */
  upiIds?: Record<string, string>
}) {
  const others = group.members.filter((member) => member.id !== user.id)
  const [otherId, setOtherId] = useState(others[0]?.id ?? "")
  const [upToDate, setUpToDate] = useState(todayISO())
  const [editingDate, setEditingDate] = useState(false)
  const [amount, setAmount] = useState("")
  const [owed, setOwed] = useState<number | null>(null)
  const [upiOpened, setUpiOpened] = useState(false)
  const { pending: saving, run } = useAction()
  const resolver = useAction()
  const desktop = useDesktop()

  const other = others.find((member) => member.id === otherId)
  const firstName = other?.displayName.split(" ")[0] ?? "them"
  const otherUpi = otherId ? upiIds[otherId] : undefined
  const enteredPaise = rupeesToPaise(amount) ?? 0
  const breakdown = owed === null ? null : settleBreakdown(owed, group.settlements, user.id, otherId)
  const remaining = breakdown?.direction === "i-owe" ? breakdown.remainingPaise : 0

  useEffect(() => {
    if (!otherId) return
    let cancel = false
    void suggestSettlementAction(group.id, otherId, upToDate).then((result) => {
      if (cancel) return
      setOwed(result.ok ? result.data : null)
    })
    return () => {
      cancel = true
    }
  }, [group.id, otherId, upToDate])

  // Prefill with what is left to pay whenever the person, date or pending payments change.
  const [prefilledFor, setPrefilledFor] = useState("")
  const prefillKey = `${otherId}:${upToDate}:${owed}:${remaining}`
  if (owed !== null && prefillKey !== prefilledFor) {
    setPrefilledFor(prefillKey)
    setAmount(remaining > 0 ? paiseToInput(remaining) : "")
    setUpiOpened(false)
  }

  function choosePerson(id: string) {
    if (id === otherId) return
    setOwed(null)
    setOtherId(id)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const paise = rupeesToPaise(amount)
    if (!otherId || paise === null || paise <= 0) {
      toast.error("Enter the amount you paid")
      return
    }
    run(
      () => requestSettlementAction({ groupId: group.id, toUserId: otherId, amountPaise: paise, upToDate }),
      { success: `Sent to ${firstName} to approve`, onSuccess: () => setUpiOpened(false) },
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
  const canPay = breakdown?.direction === "i-owe" && breakdown.remainingPaise > 0
  const validAmount = enteredPaise > 0
  // Step 2 leads once step 1 is done: after the UPI app was opened, on desktop (a QR has no tap),
  // or when there is no UPI step at all.
  const confirmIsPrimary = !otherUpi || upiOpened || desktop

  return (
    <div className="px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-8 md:px-0 md:pt-6">
      <Link
        href={`/groups/${group.id}`}
        className="-ml-2 inline-flex h-10 items-center gap-1 rounded-[12px] px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> {group.name}
      </Link>
      <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight">Settle up</h1>

      {others.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Invite someone before you can settle.</p>
      ) : (
        <>
          {others.length > 1 ? (
            <div role="radiogroup" aria-label="Settle with" className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {others.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  role="radio"
                  aria-checked={otherId === member.id}
                  onClick={() => choosePerson(member.id)}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-full border pr-3.5 pl-1.5 text-sm font-medium transition",
                    otherId === member.id ? "border-primary bg-accent" : "border-border hover:bg-muted/60",
                  )}
                >
                  <Person id={member.id} name={member.displayName} size="sm" />
                  {member.displayName.split(" ")[0]}
                </button>
              ))}
            </div>
          ) : null}

          <BalanceCard
            name={firstName}
            otherId={otherId}
            fullName={other?.displayName ?? ""}
            breakdown={breakdown}
            upToDate={upToDate}
            editingDate={editingDate}
            onEditDate={() => setEditingDate((value) => !value)}
            onDateChange={(value) => {
              if (value) setUpToDate(value)
            }}
          />

          {disputed.length > 0 ? (
            <div className="mt-3">
              <Notice tone="warning" title="Disputed in this range">
                {disputed.map((expense) => expense.description).join(", ")} still count.
              </Notice>
            </div>
          ) : null}

          {canPay ? (
            <form onSubmit={submit} className="mt-5 space-y-4" aria-label={`Pay ${firstName}`}>
              <div>
                <div className="mb-1.5 flex items-end justify-between gap-2">
                  <label htmlFor="settle-amount" className="text-sm font-medium">
                    Amount to be paid
                  </label>
                  {enteredPaise !== remaining ? (
                    <button
                      type="button"
                      onClick={() => setAmount(paiseToInput(remaining))}
                      className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground hover:bg-accent/70"
                    >
                      Full amount {formatINR(remaining)}
                    </button>
                  ) : null}
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lg text-muted-foreground">₹</span>
                  <Input
                    id="settle-amount"
                    inputMode="decimal"
                    value={amount}
                    placeholder="0"
                    onChange={(event) => {
                      setAmount(event.target.value.replace(/[^\d.]/g, ""))
                      setUpiOpened(false)
                    }}
                    aria-describedby="settle-amount-hint"
                    className="money h-14 rounded-[12px] pr-3 pl-8 text-2xl"
                  />
                </div>
                <p id="settle-amount-hint" className="mt-1.5 text-xs text-muted-foreground">
                  {enteredPaise > 0 && enteredPaise < remaining
                    ? `Paying part of it. ${formatINR(remaining - enteredPaise)} will still be left.`
                    : "Change it if you're paying only part of it."}
                </p>
              </div>

              <ol className="space-y-3">
                {otherUpi ? (
                  <Step number={1} title={desktop ? `Scan to pay ${firstName}` : `Pay ${firstName} with UPI`} done={upiOpened}>
                    <UpiStep
                      vpa={otherUpi}
                      name={other?.displayName ?? firstName}
                      amountPaise={enteredPaise}
                      opened={upiOpened}
                      onOpened={() => setUpiOpened(true)}
                    />
                  </Step>
                ) : null}
                <Step
                  number={otherUpi ? 2 : 1}
                  title={otherUpi ? `Tell ${firstName} you've paid` : `Pay ${firstName}, then mark it paid`}
                  muted={Boolean(otherUpi) && !confirmIsPrimary}
                >
                  {!otherUpi ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      Pay in cash or any app. {firstName} hasn&apos;t added a UPI ID yet, so ask them to add one in Account to pay in one tap next time.
                    </p>
                  ) : (
                    <p className="mb-3 text-sm text-muted-foreground">
                      {upiOpened
                        ? `Done paying? Let ${firstName} know so they can approve it.`
                        : "Paid in cash or another app? You can skip step 1."}
                    </p>
                  )}
                  <Button
                    type="submit"
                    size="xl"
                    variant={confirmIsPrimary ? "default" : "outline"}
                    className="w-full"
                    disabled={!validAmount}
                    pending={saving}
                  >
                    {saving ? (
                      "Sending…"
                    ) : (
                      <>
                        <CircleCheckIcon />
                        I&apos;ve paid — ask {firstName} to approve
                      </>
                    )}
                  </Button>
                </Step>
              </ol>
              <p className="text-center text-xs text-muted-foreground">
                It counts once {firstName} approves. That locks expenses through {formatDay(upToDate)}.
              </p>
            </form>
          ) : null}
        </>
      )}

      {incoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Needs you</h2>
          <div className="mt-3 space-y-3">
            {incoming.map((item) => {
              const from = group.members.find((member) => member.id === item.fromUserId)
              return (
                <article key={item.id} className="rounded-[16px] bg-card p-4 ring-1 ring-border">
                  <p className="font-medium">
                    {from?.displayName.split(" ")[0]} says they paid you {formatINR(item.amountPaise)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Check you received it. Covers expenses through {formatDay(item.upToDate)}.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="lg" disabled={resolver.pending} onClick={() => resolve(item.id, false)}>
                      Not received
                    </Button>
                    <Button size="lg" pending={resolver.pending} onClick={() => resolve(item.id, true)}>
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
                          {item.fromUserId === user.id ? "You" : from} paid {item.toUserId === user.id ? "you" : to}
                        </p>
                        <p className="text-xs text-muted-foreground">Through {formatDay(item.upToDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="money text-lg">{formatINR(item.amountPaise)}</p>
                        <p
                          className={cn(
                            "text-xs font-medium",
                            item.status === "approved" ? "text-positive" : item.status === "rejected" ? "text-negative" : "text-warning",
                          )}
                        >
                          {item.status === "pending" ? "Waiting for approval" : item.status === "approved" ? "Approved" : "Declined"}
                        </p>
                      </div>
                    </div>
                    {mine ? (
                      <button
                        type="button"
                        disabled={resolver.pending}
                        onClick={() => cancel(item.id)}
                        className="mt-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                      >
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

function BalanceCard({
  name,
  otherId,
  fullName,
  breakdown,
  upToDate,
  editingDate,
  onEditDate,
  onDateChange,
}: {
  name: string
  otherId: string
  fullName: string
  breakdown: ReturnType<typeof settleBreakdown> | null
  upToDate: string
  editingDate: boolean
  onEditDate: () => void
  onDateChange: (value: string) => void
}) {
  const dateId = useId()
  const iOwe = breakdown?.direction === "i-owe"
  const theyOwe = breakdown?.direction === "they-owe"

  let headline: React.ReactNode
  if (!breakdown) headline = <span className="text-muted-foreground">Working out the balance…</span>
  else if (iOwe) headline = <>You owe {name}</>
  else if (theyOwe) headline = <>{name} owes you</>
  else headline = <>You and {name} are square</>

  return (
    <section aria-live="polite" className="mt-4 rounded-[16px] bg-card p-4 ring-1 ring-border md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{headline}</p>
          {breakdown && breakdown.direction !== "square" ? (
            <p className={cn("money mt-1 text-[2.1rem] leading-none", iOwe ? "text-negative" : "text-positive")}>
              {formatINR(breakdown.owedPaise)}
            </p>
          ) : null}
        </div>
        {otherId ? <Person id={otherId} name={fullName} /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <CalendarIcon className="size-3.5" aria-hidden />
        <span>Expenses through {formatDay(upToDate)}</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={onEditDate}
          aria-expanded={editingDate}
          aria-controls={dateId}
          className="font-semibold text-primary hover:underline"
        >
          {editingDate ? "Done" : "Change"}
        </button>
      </div>
      {editingDate ? (
        <div id={dateId} className="mt-2">
          <label htmlFor={`${dateId}-input`} className="sr-only">
            Settle expenses through
          </label>
          <Input
            id={`${dateId}-input`}
            type="date"
            value={upToDate}
            max={todayISO()}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-11 rounded-[12px] px-3 text-base sm:max-w-56"
          />
        </div>
      ) : null}

      {breakdown && breakdown.direction !== "square" && breakdown.pendingPaise > 0 ? (
        <dl className="mt-4 grid grid-cols-2 divide-x rounded-[12px] bg-muted/60">
          <div className="px-3 py-2.5">
            <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ClockIcon className="size-3" aria-hidden /> {iOwe ? "Paid · pending approval" : `${name} paid · pending`}
            </dt>
            <dd className="money mt-0.5 text-base text-warning">{formatINR(breakdown.pendingPaise)}</dd>
          </div>
          <div className="px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{iOwe ? "Left to pay" : "Still to come"}</dt>
            <dd className={cn("money mt-0.5 text-base font-semibold", breakdown.remainingPaise === 0 && "text-positive")}>
              {breakdown.remainingPaise === 0 ? "Nothing" : formatINR(breakdown.remainingPaise)}
            </dd>
          </div>
        </dl>
      ) : null}

      {breakdown && iOwe && breakdown.remainingPaise === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          You&apos;ve recorded the full amount. It settles once {name} approves.
        </p>
      ) : null}
      {breakdown && theyOwe ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {breakdown.pendingPaise > 0
            ? `${name} has recorded a payment. Approve it below once you've received it.`
            : `${name} records the payment from their account, then you approve it here.`}
        </p>
      ) : null}
    </section>
  )
}

function Step({
  number,
  title,
  done = false,
  muted = false,
  children,
}: {
  number: number
  title: string
  done?: boolean
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <li className={cn("rounded-[16px] bg-card p-4 ring-1 ring-border transition", !muted && !done && "ring-primary/40")}>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            done ? "bg-positive text-white" : muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
          )}
          aria-hidden
        >
          {done ? <CheckIcon className="size-3.5" /> : number}
        </span>
        <h2 className={cn("text-sm font-semibold", muted && "text-muted-foreground")}>
          <span className="sr-only">Step {number}: </span>
          {title}
        </h2>
      </div>
      {children}
    </li>
  )
}

function UpiStep({
  vpa,
  name,
  amountPaise,
  opened,
  onOpened,
}: {
  vpa: string
  name: string
  amountPaise: number
  opened: boolean
  onOpened: () => void
}) {
  const [copied, setCopied] = useState(false)
  const firstName = name.split(" ")[0]
  const valid = amountPaise > 0
  const link = upiPayLink({ vpa, name, amountPaise })

  async function copy() {
    try {
      await navigator.clipboard.writeText(vpa)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  const vpaLine = (
    <button type="button" onClick={copy} className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
      <span>UPI ID</span>
      <span className="truncate font-medium text-foreground">{vpa}</span>
      {copied ? <CheckIcon className="size-3.5 shrink-0 text-positive" /> : <CopyIcon className="size-3.5 shrink-0" />}
      <span className="sr-only">{copied ? "Copied" : "Copy UPI ID"}</span>
    </button>
  )

  return (
    <>
      {/* Phones: open the UPI app with the amount filled in. */}
      <div className="md:hidden">
        <a
          href={valid ? link : undefined}
          aria-disabled={!valid}
          onClick={() => valid && onOpened()}
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-[12px] text-[15px] font-semibold",
            opened ? "border border-border bg-background hover:bg-muted" : "gradient-primary shadow-sm",
            !valid && "pointer-events-none opacity-50",
          )}
        >
          <SmartphoneIcon className="size-5" />
          {opened ? "Open UPI app again" : `Pay ${valid ? formatINR(amountPaise) : ""} via UPI`}
        </a>
        <div className="mt-2 text-center">{vpaLine}</div>
      </div>

      {/* Larger screens: the same link as a QR to scan with a phone. */}
      <div className="hidden items-center gap-5 md:flex">
        <div className="shrink-0 rounded-[12px] bg-white p-2.5 ring-1 ring-border">
          {valid ? (
            <QRCodeSVG value={link} size={136} level="M" marginSize={0} title={`UPI QR code to pay ${firstName}`} />
          ) : (
            <div className="size-[136px]" />
          )}
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <p className="money text-2xl">{valid ? formatINR(amountPaise) : "—"}</p>
          <p className="text-muted-foreground">Scan with GPay, PhonePe, Paytm or any UPI app. The amount fills in for you.</p>
          {vpaLine}
        </div>
      </div>
    </>
  )
}
