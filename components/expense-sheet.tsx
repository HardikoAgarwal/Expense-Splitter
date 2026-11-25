"use client"

import { useMemo, useState } from "react"
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, LockIcon } from "lucide-react"

import { CategoryIcon } from "@/components/category-icon"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SECTION_TITLE } from "@/components/field"
import { deleteExpenseAction, saveExpenseAction } from "@/lib/actions"
import { CATEGORIES } from "@/lib/categories"
import { splitEqually, validateShares } from "@/lib/ledger"
import { formatDay, formatINR, paiseToInput, rupeesToPaise, todayISO } from "@/lib/money"
import type { Expense, GroupDetail, Member, Share } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export function ExpenseSheet({
  open,
  onOpenChange,
  group,
  expense,
  loading,
  userId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: GroupDetail | null
  expense: Expense | null
  loading: boolean
  userId: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-[20px] p-0 ring-1 ring-border sm:max-w-lg",
          "top-[calc(var(--vv-offset-top,0px)+var(--vv-height,100dvh)/2)] max-h-[calc(var(--vv-height,100dvh)-1.5rem)]",
        )}
      >
        {loading || !group ? (
          <>
            <DialogHeader className="shrink-0 space-y-1 px-4 pt-4 pr-12 pb-2 text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {expense ? "Edit expense" : "Add expense"}
              </DialogTitle>
              <DialogDescription className="sr-only">Loading the group</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 px-4 py-4">
              <Skeleton className="h-16 w-40" />
              <Skeleton className="h-12 w-full rounded-[12px]" />
              <Skeleton className="h-12 w-full rounded-[12px]" />
              <Skeleton className="h-24 w-full rounded-[12px]" />
            </div>
          </>
        ) : (
          <ExpenseForm
            key={`${group.id}:${expense?.id ?? "new"}:${expense?.updatedAt ?? ""}`}
            group={group}
            expense={expense}
            userId={userId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ExpenseForm({
  group,
  expense,
  userId,
  onDone,
}: {
  group: GroupDetail
  expense: Expense | null
  userId: string
  onDone: () => void
}) {
  const { pending: saving, run } = useAction()
  const locked = Boolean(expense?.locked || expense?.leftMember)
  const initial = useMemo(
    () => initialState(group.members, expense, userId),
    [group.members, expense, userId],
  )
  const [description, setDescription] = useState(initial.description)
  const [amount, setAmount] = useState(initial.amount)
  const [expenseDate, setExpenseDate] = useState(initial.expenseDate)
  const [category, setCategory] = useState<string | null>(initial.category)
  const [payerId, setPayerId] = useState(initial.payerId)
  const [mode, setMode] = useState<"equal" | "custom">(initial.mode)
  const [selected, setSelected] = useState<string[]>(initial.selected)
  const [custom, setCustom] = useState<Record<string, string>>(initial.custom)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [step, setStep] = useState<"main" | "split">("main")

  const totalPaise = amount.trim() ? rupeesToPaise(amount) : null
  const shares = buildShares(mode, selected, custom, totalPaise)
  const shareError =
    totalPaise && shares
      ? validateShares(totalPaise, shares)
      : totalPaise === null && amount.trim()
        ? "Enter an amount like 500 or 200.50"
        : mode === "custom" && totalPaise && !shares
          ? "Check the amounts"
          : mode === "equal" && totalPaise && selected.length === 0
            ? "Choose who shares this expense"
            : null
  const assigned = (shares ?? []).reduce((sum, share) => sum + share.sharePaise, 0)
  const remaining = totalPaise === null || !shares ? null : totalPaise - assigned
  const futureDate = expenseDate > todayISO()
  const hitsLock = Boolean(group.lockDate && expenseDate < group.lockDate)
  const canSave =
    !locked && !hitsLock && !futureDate && !saving && Boolean(description.trim()) && shareError === null && Boolean(shares)

  // After fixing a disputed expense, the next step is asking the flagger to resolve it.
  function updatedMessage() {
    const waiting = expense?.flags.find((flag) => flag.awaiting === "owner")
    if (!waiting) return "Expense updated"
    const name = group.members.find((member) => member.id === waiting.userId)?.displayName.split(" ")[0] ?? "them"
    return `Expense updated. Now ask ${name} to resolve the dispute`
  }

  function save() {
    if (!canSave || !shares || totalPaise === null) return
    // The sheet closes and the toast shows only once the group list has the new numbers.
    run(
      () =>
        saveExpenseAction({
          id: expense?.id,
          groupId: group.id,
          description,
          amountPaise: totalPaise,
          payerId,
          expenseDate,
          category,
          shares,
        }),
      { success: expense ? updatedMessage() : "Expense added", onSuccess: onDone },
    )
  }

  function remove() {
    if (!expense) return
    run(() => deleteExpenseAction(expense.id), {
      success: "Expense deleted",
      onSuccess: () => {
        setConfirmDelete(false)
        onDone()
      },
    })
  }

  function fillRest(memberId: string) {
    if (totalPaise === null) return
    let others = 0
    for (const member of group.members) {
      if (member.id === memberId) continue
      const parsed = custom[member.id]?.trim() ? rupeesToPaise(custom[member.id]) : 0
      if (parsed === null) return
      others += parsed
    }
    const rest = totalPaise - others
    if (rest < 0) return
    setCustom((current) => ({ ...current, [memberId]: paiseToInput(rest) }))
  }

  const splitSummary =
    mode === "custom"
      ? remaining === null
        ? "Custom split"
        : remaining === 0
          ? "Custom split · balanced"
          : remaining > 0
            ? `Custom · ${formatINR(remaining)} left`
            : `Custom · ${formatINR(Math.abs(remaining))} over`
      : selected.length === group.members.length
        ? `Split equally with ${selected.length} ${selected.length === 1 ? "person" : "people"}`
        : selected.length === 0
          ? "Choose who splits this"
          : `Split equally with ${selected.length} of ${group.members.length}`

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (step === "split") {
          setStep("main")
          return
        }
        save()
      }}
    >
      <DialogHeader className="shrink-0 space-y-1 px-4 pt-4 pr-12 pb-2 text-left">
        {step === "split" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep("main")}
              className="flex size-9 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Back to expense details"
            >
              <ArrowLeftIcon className="size-5" />
            </button>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold tracking-tight">Split</DialogTitle>
              <DialogDescription>Who owes what for this expense.</DialogDescription>
            </div>
          </div>
        ) : (
          <>
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {expense ? "Edit expense" : "Add expense"}
            </DialogTitle>
            <DialogDescription>{group.name}</DialogDescription>
          </>
        )}
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pt-1 pb-3">
        {step === "split" ? (
          <SplitStep
            group={group}
            locked={locked}
            mode={mode}
            setMode={setMode}
            selected={selected}
            setSelected={setSelected}
            custom={custom}
            setCustom={setCustom}
            shares={shares}
            payerId={payerId}
            totalPaise={totalPaise}
            remaining={remaining}
            onFill={fillRest}
          />
        ) : (
          <>
            {locked || hitsLock ? (
              <Notice tone="neutral" icon={<LockIcon className="size-4" />} title={locked ? "Locked" : "Date locked"}>
                {expense?.leftMember
                  ? `${expense.leftMember.split(" ")[0]} left the group, so this can't be changed.`
                  : locked
                  ? `Settled through ${formatDay(group.lockDate ?? expense!.expenseDate)}.`
                  : `Pick ${formatDay(group.lockDate!)} or later.`}
              </Notice>
            ) : null}
            {futureDate ? (
              <Notice tone="neutral" icon={<LockIcon className="size-4" />} title="Future date">
                Expenses can&apos;t be dated after today.
              </Notice>
            ) : null}

            <label className="block">
              <span className="sr-only">Amount</span>
              <div className="flex items-baseline gap-1">
                <span className="money text-3xl text-muted-foreground">₹</span>
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  disabled={locked}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                  className="money w-full bg-transparent text-5xl leading-none outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            </label>

            <Input
              value={description}
              disabled={locked}
              maxLength={80}
              placeholder="What was it?"
              onChange={(event) => setDescription(event.target.value)}
              className="h-12 rounded-[12px] px-3.5 text-base"
            />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Paid by">
                <select
                  disabled={locked}
                  value={payerId}
                  onChange={(event) => setPayerId(event.target.value)}
                  className="h-12 w-full rounded-[12px] border border-input bg-transparent px-3 text-base outline-none"
                >
                  {group.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {firstName(member.displayName)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <Input
                  type="date"
                  disabled={locked}
                  value={expenseDate}
                  max={todayISO()}
                  onChange={(event) => setExpenseDate(event.target.value)}
                  className="h-12 rounded-[12px] px-3 text-base"
                />
              </Field>
            </div>

            <Field label="Category">
              <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                {CATEGORIES.map((item) => {
                  const active = category === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={locked}
                      onClick={() => setCategory(active ? null : item.id)}
                      className={cn(
                        "flex h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium",
                        active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <CategoryIcon category={item.id} className="size-6 rounded-full" />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <button
              type="button"
              disabled={locked}
              onClick={() => setStep("split")}
              className="flex h-14 w-full items-center justify-between rounded-[16px] bg-card px-4 text-left ring-1 ring-border"
            >
              <span>
                <span className="block text-sm font-medium">{splitSummary}</span>
                {shareError && amount.trim() ? (
                  <span className="block text-xs text-negative">{shareError}</span>
                ) : null}
              </span>
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            </button>
          </>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t px-4 pt-3 pb-4">
        {step === "split" ? (
          <Button type="button" size="xl" className="w-full" onClick={() => setStep("main")}>
            Back to expense
          </Button>
        ) : (
          <>
            <Button type="submit" size="xl" className="w-full" disabled={!canSave} pending={saving}>
              {saving ? "Saving…" : expense ? "Save changes" : "Save expense"}
            </Button>
            {expense && !locked ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full text-negative hover:text-negative"
                onClick={() => setConfirmDelete(true)}
              >
                Delete expense
              </Button>
            ) : null}
          </>
        )}
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this expense?</DialogTitle>
            <DialogDescription>
              {expense ? `${expense.description} · ${formatINR(expense.amountPaise)}` : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent">
            <Button type="button" variant="outline" className="h-11 rounded-[12px]" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" className="h-11 rounded-[12px]" pending={saving} onClick={remove}>
              {saving ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

function SplitStep({
  group,
  locked,
  mode,
  setMode,
  selected,
  setSelected,
  custom,
  setCustom,
  shares,
  payerId,
  totalPaise,
  remaining,
  onFill,
}: {
  group: GroupDetail
  locked: boolean
  mode: "equal" | "custom"
  setMode: (mode: "equal" | "custom") => void
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
  custom: Record<string, string>
  setCustom: React.Dispatch<React.SetStateAction<Record<string, string>>>
  shares: Share[] | null
  payerId: string
  totalPaise: number | null
  remaining: number | null
  onFill: (userId: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-[12px] bg-muted p-1">
        {(["equal", "custom"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={locked}
            onClick={() => {
              if (value === "custom" && mode === "equal" && shares) {
                setCustom(
                  Object.fromEntries(
                    group.members.map((member) => {
                      const share = shares.find((item) => item.userId === member.id)
                      return [member.id, share ? paiseToInput(share.sharePaise) : ""]
                    }),
                  ),
                )
              }
              setMode(value)
            }}
            className={cn(
              "h-11 rounded-[12px] text-sm font-semibold capitalize",
              mode === value ? "bg-card shadow-sm" : "text-muted-foreground",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      {mode === "equal"
        ? group.members.map((member) => {
            const on = selected.includes(member.id)
            const share = shares?.find((item) => item.userId === member.id)
            return (
              <button
                key={member.id}
                type="button"
                disabled={locked}
                aria-pressed={on}
                onClick={() =>
                  setSelected((current) => (on ? current.filter((id) => id !== member.id) : [...current, member.id]))
                }
                className="flex h-12 w-full items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-[6px] border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {on ? <CheckIcon className="size-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {firstName(member.displayName)}
                  {member.id === payerId ? " · paid" : ""}
                </span>
                <span className="text-sm text-muted-foreground">{on && share ? formatINR(share.sharePaise) : "Out"}</span>
              </button>
            )
          })
        : group.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{firstName(member.displayName)}</p>
                <button
                  type="button"
                  disabled={locked || totalPaise === null}
                  onClick={() => onFill(member.id)}
                  className="text-xs font-medium text-primary disabled:opacity-40"
                >
                  Use remaining
                </button>
              </div>
              <div className="relative w-28">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                <Input
                  inputMode="decimal"
                  disabled={locked}
                  value={custom[member.id] ?? ""}
                  placeholder="0"
                  onChange={(event) =>
                    setCustom((current) => ({
                      ...current,
                      [member.id]: event.target.value.replace(/[^\d.]/g, ""),
                    }))
                  }
                  className="money h-12 rounded-[12px] pr-3 pl-7 text-right text-lg"
                />
              </div>
            </div>
          ))}
      {mode === "custom" ? (
        <p className={cn("text-sm font-medium", remaining === 0 ? "text-positive" : "text-negative")}>
          {remaining === null
            ? "Enter the total first"
            : remaining === 0
              ? "Balanced"
              : remaining > 0
                ? `${formatINR(remaining)} left`
                : `${formatINR(Math.abs(remaining))} over`}
        </p>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={cn(SECTION_TITLE, "mb-2.5 block")}>{label}</span>
      {children}
    </label>
  )
}

function firstName(name: string) {
  return name.split(" ")[0] || name
}

function buildShares(
  mode: "equal" | "custom",
  selected: string[],
  custom: Record<string, string>,
  totalPaise: number | null,
): Share[] | null {
  if (mode === "equal") {
    if (!totalPaise || selected.length === 0) return null
    try {
      return splitEqually(totalPaise, selected)
    } catch {
      return null
    }
  }
  const shares: Share[] = []
  for (const [id, value] of Object.entries(custom)) {
    if (!value.trim()) {
      shares.push({ userId: id, sharePaise: 0 })
      continue
    }
    const paise = rupeesToPaise(value)
    if (paise === null) return null
    shares.push({ userId: id, sharePaise: paise })
  }
  return shares.filter((share) => share.sharePaise > 0)
}

function initialState(members: Member[], expense: Expense | null, userId: string) {
  const all = members.map((member) => member.id)
  if (!expense) {
    return {
      description: "",
      amount: "",
      expenseDate: todayISO(),
      category: null as string | null,
      payerId: all.includes(userId) ? userId : (all[0] ?? ""),
      mode: "equal" as const,
      selected: all,
      custom: Object.fromEntries(all.map((id) => [id, ""])),
    }
  }
  const participantIds = expense.shares.filter((share) => share.sharePaise > 0).map((share) => share.userId)
  let equal = false
  try {
    const expected = splitEqually(expense.amountPaise, participantIds)
    equal =
      expected.length === expense.shares.filter((share) => share.sharePaise > 0).length &&
      expected.every((share) =>
        expense.shares.some((item) => item.userId === share.userId && item.sharePaise === share.sharePaise),
      )
  } catch {
    equal = false
  }
  return {
    description: expense.description,
    amount: paiseToInput(expense.amountPaise),
    expenseDate: expense.expenseDate,
    category: expense.category,
    payerId: expense.payerId,
    mode: equal ? ("equal" as const) : ("custom" as const),
    selected: participantIds,
    custom: Object.fromEntries(
      all.map((id) => {
        const share = expense.shares.find((item) => item.userId === id)
        return [id, share && share.sharePaise > 0 ? paiseToInput(share.sharePaise) : ""]
      }),
    ),
  }
}
