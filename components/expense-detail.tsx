"use client"

import { useState } from "react"

import { AppSheet } from "@/components/app-sheet"
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
import { deleteExpenseAction, flagExpenseAction, resolveFlagAction } from "@/lib/actions"
import { formatDay, formatINR } from "@/lib/money"
import type { ActionResult, Expense, GroupDetail, SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"

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
  const { pending: busy, run } = useAction()
  const [reason, setReason] = useState("")
  const [flagging, setFlagging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mine = expense?.shares.find((share) => share.userId === user.id)?.sharePaise ?? 0
  const myFlag = expense?.flags.find((flag) => flag.userId === user.id) ?? null
  const canFlag = mine > 0 && !myFlag
  const canResolve = expense
    ? expense.flags.some((flag) => flag.userId === user.id || expense.createdBy === user.id)
    : false
  const canDelete = Boolean(expense && !expense.locked)
  const payer = group.members.find((member) => member.id === expense?.payerId)
  const participants = (expense?.shares ?? []).filter((share) => share.sharePaise > 0)

  function flag() {
    if (!expense) return
    run(() => flagExpenseAction(expense.id, reason), {
      success: "Flagged",
      onSuccess: () => {
        setFlagging(false)
        setReason("")
      },
    })
  }

  function resolveOpen() {
    if (!expense) return
    const allowed = expense.flags.filter((flag) => flag.userId === user.id || expense.createdBy === user.id)
    run(
      async (): Promise<ActionResult<undefined>> => {
        for (const openFlag of allowed) {
          const result = await resolveFlagAction(openFlag.id)
          if (!result.ok) return result
        }
        return { ok: true, data: undefined }
      },
      { success: "Flag resolved" },
    )
  }

  function remove() {
    if (!expense) return
    run(() => deleteExpenseAction(expense.id), {
      success: "Expense deleted",
      onSuccess: () => {
        setConfirmDelete(false)
        onClose()
      },
    })
  }

  return (
    <>
      <AppSheet
        open={Boolean(expense)}
        onOpenChange={(open) => !open && onClose()}
        title={expense?.description ?? "Expense"}
        description={
          expense ? `${payer?.displayName.split(" ")[0] ?? "Someone"} paid · ${formatDay(expense.expenseDate)}` : undefined
        }
        footer={
          expense ? (
            <div className="flex w-full flex-col gap-2">
              <Button
                className="h-12 w-full rounded-[12px]"
                onClick={() => onEdit(expense)}
                disabled={expense.locked}
              >
                {expense.locked ? "Locked" : "Edit"}
              </Button>
              {canDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-[12px] text-negative hover:text-negative"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {expense ? (
          <div className="space-y-4 pb-2">
            <p className="money text-center text-3xl">{formatINR(expense.amountPaise)}</p>
            {expense.disputed ? (
              <Notice
                tone="warning"
                title="Disputed"
                action={
                  canResolve ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-primary"
                      disabled={busy}
                      onClick={() => resolveOpen()}
                    >
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
                    flag()
                  }}
                >
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={200}
                    placeholder="Optional note"
                    className="min-h-20 w-full rounded-[12px] border border-input bg-transparent px-3 py-2 text-base outline-none"
                  />
                  <Button type="submit" variant="outline" className="h-11 w-full rounded-[12px]" pending={busy}>
                    Flag expense
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  className="w-full text-center text-sm font-medium text-muted-foreground"
                  onClick={() => setFlagging(true)}
                >
                  Flag
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </AppSheet>

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
            <Button type="button" variant="destructive" className="h-11 rounded-[12px]" pending={busy} onClick={() => remove()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
