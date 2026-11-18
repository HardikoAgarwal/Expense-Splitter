"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { QRCodeSVG } from "qrcode.react"
import { ArrowLeftIcon, CheckIcon, CircleCheckIcon, CopyIcon, SmartphoneIcon } from "lucide-react"
import { toast } from "sonner"

import { Field, FieldLabel, SECTION_TITLE, SectionTitle } from "@/components/field"
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
import type { GroupDetail, SessionUser, Settlement } from "@/lib/types"
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
  // Open on whoever has a payment waiting for my approval, if anyone.
  const [otherId, setOtherId] = useState(
    group.settlements.find((item) => item.status === "pending" && item.toUserId === user.id)?.fromUserId ?? others[0]?.id ?? "",
  )
  const [upToDate, setUpToDate] = useState(todayISO())
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
  const theyOwe = breakdown?.direction === "they-owe"
  // Requests shown in the approver view are not repeated in the general list.
  const otherRequests = theyOwe ? incoming.filter((item) => item.fromUserId !== otherId) : incoming
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

          {theyOwe && breakdown ? (
            <ApproverView
              name={firstName}
              owedPaise={breakdown.owedPaise}
              remainingPaise={breakdown.remainingPaise}
              requests={incoming.filter((item) => item.fromUserId === otherId)}
              busy={resolver.pending}
              onResolve={resolve}
            />
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-7" aria-label={`Pay ${firstName}`}>
              <Field>
                <FieldLabel htmlFor="settle-date">Expenses through</FieldLabel>
                <Input
                  id="settle-date"
                  type="date"
                  value={upToDate}
                  max={todayISO()}
                  onChange={(event) => {
                    if (event.target.value) setUpToDate(event.target.value)
                  }}
                  className="h-12 rounded-[12px] px-3.5 text-base"
                />
              </Field>

              <div aria-live="polite">
                <p className={cn(SECTION_TITLE, "mb-2.5")}>Balance through {formatDay(upToDate)}</p>
                {!breakdown ? (
                  <p className="text-sm text-muted-foreground">Working out the balance…</p>
                ) : breakdown.direction === "i-owe" ? (
                  <>
                    <p className="text-lg font-medium">
                      You owe {firstName} <span className="money text-negative">{formatINR(breakdown.owedPaise)}</span>
                    </p>
                    {breakdown.pendingPaise > 0 ? (
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {formatINR(breakdown.pendingPaise)} you sent is waiting for approval
                        {breakdown.remainingPaise > 0
                          ? `, so ${formatINR(breakdown.remainingPaise)} is left to pay.`
                          : `. That covers it; it settles once ${firstName} approves.`}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-lg font-medium">You and {firstName} are square.</p>
                )}
              </div>

              {canPay ? (
                <Field>
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor="settle-amount">Amount to be paid</FieldLabel>
                    {enteredPaise !== remaining ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAmount(paiseToInput(remaining))
                          setUpiOpened(false)
                        }}
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
                      aria-describedby="settle-amount-result"
                      className="money h-14 rounded-[12px] pr-3 pl-8 text-2xl"
                    />
                  </div>
                  <p id="settle-amount-result" aria-live="polite" className="flex items-center justify-between gap-2 text-sm">
                    {enteredPaise <= 0 ? (
                      <span className="text-muted-foreground">Enter the amount you&apos;re paying.</span>
                    ) : enteredPaise < remaining ? (
                      <>
                        <span className="text-muted-foreground">Remaining after this</span>
                        <span className="money font-semibold">{formatINR(remaining - enteredPaise)}</span>
                      </>
                    ) : enteredPaise === remaining ? (
                      <span className="flex items-center gap-1.5 font-medium text-positive">
                        <CircleCheckIcon className="size-4" /> Settles fully
                      </span>
                    ) : (
                      <span className="text-warning">That&apos;s {formatINR(enteredPaise - remaining)} more than you owe.</span>
                    )}
                  </p>
                </Field>
              ) : null}

              {disputed.length > 0 ? (
                <Notice tone="warning" title="Disputed in this range">
                  {disputed.map((expense) => expense.description).join(", ")} still count.
                </Notice>
              ) : null}

              {canPay ? (
                <>
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
                </>
              ) : null}
            </form>
          )}
        </>
      )}

      {otherRequests.length > 0 ? (
        <Section title="Needs you">
          <div className="divide-y border-y">
            {otherRequests.map((item) => (
              <RequestRow
                key={item.id}
                name={group.members.find((member) => member.id === item.fromUserId)?.displayName.split(" ")[0] ?? "Someone"}
                request={item}
                busy={resolver.pending}
                onResolve={resolve}
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="History">
        {group.settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No settlements yet.</p>
        ) : (
          <div className="divide-y border-y">
            <ShowList
              items={group.settlements}
              limit={4}
              render={(item) => {
                const from = group.members.find((member) => member.id === item.fromUserId)?.displayName.split(" ")[0]
                const to = group.members.find((member) => member.id === item.toUserId)?.displayName.split(" ")[0]
                const mine = item.createdBy === user.id && item.status === "pending"
                return (
                  <div key={item.id} className="flex items-start justify-between gap-3 py-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {item.fromUserId === user.id ? "You" : from} paid {item.toUserId === user.id ? "you" : to}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Through {formatDay(item.upToDate)}</p>
                      {mine ? (
                        <button
                          type="button"
                          disabled={resolver.pending}
                          onClick={() => cancel(item.id)}
                          className="mt-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Cancel request
                        </button>
                      ) : null}
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
                )
              }}
            />
          </div>
        )}
      </Section>
    </div>
  )
}

function RequestRow({
  name,
  request,
  busy,
  onResolve,
}: {
  name: string
  request: Settlement
  busy: boolean
  onResolve: (id: string, approve: boolean) => void
}) {
  return (
    <article className="py-4">
      <p className="text-lg font-medium">
        {name} says they paid you <span className="money text-positive">{formatINR(request.amountPaise)}</span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Covers expenses through {formatDay(request.upToDate)}. Check you received it.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-sm">
        <Button variant="outline" size="lg" disabled={busy} onClick={() => onResolve(request.id, false)}>
          Not received
        </Button>
        <Button size="lg" pending={busy} onClick={() => onResolve(request.id, true)}>
          Approve
        </Button>
      </div>
    </article>
  )
}

/** When they owe me: just their payment requests to approve, and one line for the rest. */
function ApproverView({
  name,
  owedPaise,
  remainingPaise,
  requests,
  busy,
  onResolve,
}: {
  name: string
  owedPaise: number
  remainingPaise: number
  requests: Settlement[]
  busy: boolean
  onResolve: (id: string, approve: boolean) => void
}) {
  if (requests.length === 0) {
    return (
      <section className="mt-6">
        <p className="text-lg font-medium">
          {name} owes you <span className="money text-positive">{formatINR(owedPaise)}</span>
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {name} records the payment from their account. You&apos;ll approve it here.
        </p>
      </section>
    )
  }
  return (
    <section className="mt-6" aria-label="Payments to approve">
      <SectionTitle>Needs your approval</SectionTitle>
      <div className="divide-y">
        {requests.map((item) => (
          <RequestRow key={item.id} name={name} request={item} busy={busy} onResolve={onResolve} />
        ))}
      </div>
      <p className="mt-1 border-t pt-4 text-sm text-muted-foreground">
        {remainingPaise > 0 ? (
          <>
            {name} still owes you <span className="money font-semibold text-foreground">{formatINR(remainingPaise)}</span> after{" "}
            {requests.length === 1 ? "this" : "these"}.
          </>
        ) : (
          <>That settles everything {name} owes you.</>
        )}
      </p>
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
