"use client"

import { useState } from "react"

import { FlagIcon, LockIcon, PencilIcon, Trash2Icon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { CategoryIcon } from "@/components/category-icon"
import { SectionTitle } from "@/components/field"
import { Notice } from "@/components/notice"
import { Person } from "@/components/person"
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
import { categoryLabel } from "@/lib/categories"
import { canModifyExpense } from "@/lib/expense-access"
import { formatDay, formatINR } from "@/lib/money"
import type { ActionResult, Expense, GroupDetail, SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

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
  const canFlag = mine > 0 && !myFlag && expense?.createdBy !== user.id
  const canResolve = expense
    ? expense.flags.some((flag) => flag.userId === user.id || expense.createdBy === user.id)
    : false
  const canModify = canModifyExpense(expense, user.id)
  const fullName = (id: string) => group.members.find((member) => member.id === id)?.displayName ?? "Former member"
  const nameOf = (id: string) => (id === user.id ? "You" : fullName(id))
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
    if (!expense || !canModify) return
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
        footer={
          expense && canModify ? (
            expense.locked ? (
              <p className="flex w-full items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
                <LockIcon className="size-4" aria-hidden /> Locked by an approved settlement
              </p>
            ) : (
              <div className="grid w-full grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-[12px] text-negative hover:text-negative"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2Icon /> Delete
                </Button>
                <Button className="h-12 rounded-[12px]" onClick={() => onEdit(expense)}>
                  <PencilIcon /> Edit
                </Button>
              </div>
            )
          ) : null
        }
      >
        {expense ? (
          <div className="space-y-5 pb-3">
            <div className="flex items-center gap-3">
              <CategoryIcon category={expense.category} />
              <div className="min-w-0">
                <p className="money text-[1.9rem] leading-tight">{formatINR(expense.amountPaise)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Paid by {nameOf(expense.payerId)} · {formatDay(expense.expenseDate)} · {categoryLabel(expense.category)}
                  {expense.createdBy !== expense.payerId ? ` · Added by ${nameOf(expense.createdBy)}` : ""}
                </p>
              </div>
            </div>

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

            <section aria-label="Split">
              <SectionTitle as="h3" className="mb-3">
                Split · {participants.length} {participants.length === 1 ? "person" : "people"}
              </SectionTitle>
              <ul className="space-y-1">
                {participants.map((share) => (
                  <li
                    key={share.userId}
                    className={cn(
                      "flex items-center gap-3 rounded-[12px] px-2 py-2 text-sm",
                      share.userId === user.id && "bg-accent/60",
                    )}
                  >
                    <Person id={share.userId} name={fullName(share.userId)} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{nameOf(share.userId)}</span>
                    <span className="money font-medium">{formatINR(share.sharePaise)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {canFlag ? (
              flagging ? (
                <form
                  className="space-y-3 rounded-[16px] bg-muted/50 p-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    flag()
                  }}
                >
                  <label htmlFor="flag-reason" className="block text-sm font-medium">
                    What looks wrong?
                  </label>
                  <textarea
                    id="flag-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={200}
                    placeholder="Optional note, e.g. I wasn't there"
                    className="min-h-20 w-full rounded-[12px] border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="ghost" className="h-11 rounded-[12px]" onClick={() => setFlagging(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="outline" className="h-11 rounded-[12px]" pending={busy}>
                      <FlagIcon /> Flag it
                    </Button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="mx-auto flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => setFlagging(true)}
                >
                  <FlagIcon className="size-4" aria-hidden /> Something wrong? Flag it
                </button>
              )
            ) : myFlag ? (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <FlagIcon className="size-4" aria-hidden /> You flagged this expense
              </p>
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
