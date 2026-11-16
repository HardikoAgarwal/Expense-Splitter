"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { AppSheet } from "@/components/app-sheet"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { flagExpenseAction, resolveFlagAction } from "@/lib/actions"
import { formatDay, formatINR } from "@/lib/money"
import type { Expense, GroupDetail, SessionUser } from "@/lib/types"

export function ExpenseDetail({
  expense,
  group,
  user,
  onEdit,
  onClose,
}: {
  expense: Expense | null
  group: GroupDetail
  user: SessionUser
  onEdit: (expense: Expense) => void
  onClose: () => void
}) {
  const router = useRouter()
  const [reason, setReason] = useState("")
  const [flagging, setFlagging] = useState(false)
  const [busy, setBusy] = useState(false)
  const mine = expense?.shares.find((share) => share.userId === user.id)?.sharePaise ?? 0
  const myFlag = expense?.flags.find((flag) => flag.userId === user.id) ?? null
  const canFlag = mine > 0 && !myFlag
  const canResolve = expense
    ? expense.flags.some((flag) => flag.userId === user.id || expense.createdBy === user.id)
    : false
  const payer = group.members.find((member) => member.id === expense?.payerId)
  const participants = (expense?.shares ?? []).filter((share) => share.sharePaise > 0)

  async function flag() {
    if (!expense) return
    setBusy(true)
    const result = await flagExpenseAction(expense.id, reason)
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Flagged")
    setFlagging(false)
    setReason("")
    router.refresh()
  }

  async function resolveOpen() {
    if (!expense) return
    const allowed = expense.flags.filter((flag) => flag.userId === user.id || expense.createdBy === user.id)
    setBusy(true)
    for (const flag of allowed) {
      const result = await resolveFlagAction(flag.id)
      if (!result.ok) {
        setBusy(false)
        toast.error(result.error)
        return
      }
    }
    setBusy(false)
    toast.success("Flag resolved")
    router.refresh()
  }

  return (
    <AppSheet
      open={Boolean(expense)}
      onOpenChange={(open) => !open && onClose()}
      title={expense?.description ?? "Expense"}
      description={expense ? `${payer?.displayName.split(" ")[0] ?? "Someone"} paid · ${formatDay(expense.expenseDate)}` : undefined}
      footer={
        expense ? (
          <Button className="h-12 w-full rounded-[12px]" onClick={() => onEdit(expense)}>
            Edit
          </Button>
        ) : null
      }
    >
      {expense ? (
        <div className="space-y-4 pb-2">
          <p className="money text-3xl">{formatINR(expense.amountPaise)}</p>
          {expense.disputed ? (
            <Notice
              tone="warning"
              title="Disputed"
              action={
                canResolve ? (
                  <button type="button" className="text-sm font-medium text-primary" disabled={busy} onClick={() => void resolveOpen()}>
                    Resolve
                  </button>
                ) : null
              }
            >
              {expense.flags[0]?.reason || "Still counted in balances."}
            </Notice>
          ) : null}
          <ul className="space-y-3">
            {participants.map((share) => {
              const member = group.members.find((item) => item.id === share.userId)
              return (
                <li key={share.userId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{share.userId === user.id ? "You" : member?.displayName}</span>
                  <span className="font-medium">{formatINR(share.sharePaise)}</span>
                </li>
              )
            })}
          </ul>
          {canFlag ? (
            flagging ? (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  void flag()
                }}
              >
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={200}
                  placeholder="Optional note"
                  className="min-h-20 w-full rounded-[12px] border border-input bg-transparent px-3 py-2 text-base outline-none"
                />
                <Button type="submit" variant="outline" className="h-11 w-full rounded-[12px]" disabled={busy}>
                  Flag expense
                </Button>
              </form>
            ) : (
              <button type="button" className="text-sm font-medium text-muted-foreground" onClick={() => setFlagging(true)}>
                Flag
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </AppSheet>
  )
}
