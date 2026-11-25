"use client"

import { useState } from "react"

import { FlagIcon, LockIcon, PencilIcon, Trash2Icon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { CategoryIcon } from "@/components/category-icon"
import { SectionTitle } from "@/components/field"
import { DisputeActions, DisputeThread, NoteDialog } from "@/components/dispute"
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
import { deleteExpenseAction, flagExpenseAction } from "@/lib/actions"
import { categoryLabel } from "@/lib/categories"
import { disputeRole, updatedSinceRaised } from "@/lib/disputes"
import { memberNameIn } from "@/lib/members"
import { canModifyExpense } from "@/lib/expense-access"
import { formatDay, formatINR } from "@/lib/money"
import type { Expense, GroupDetail, SessionUser } from "@/lib/types"
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
  const flagging = useAction()
  const [flagOpen, setFlagOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mine = expense?.shares.find((share) => share.userId === user.id)?.sharePaise ?? 0
  const myFlag = expense?.flags.find((flag) => flag.userId === user.id) ?? null
  const canFlag = mine > 0 && !myFlag && expense?.createdBy !== user.id
  const canModify = canModifyExpense(expense, user.id)
  const fullName = (id: string) => memberNameIn(group, id, "Former member")
  const nameOf = (id: string) => (id === user.id ? "You" : fullName(id))
  const participants = (expense?.shares ?? []).filter((share) => share.sharePaise > 0)
  // When a flag waits on you and you've already edited since, asking is the main step, not editing again.
  const askIsNext = Boolean(
    expense?.flags.some(
      (openFlag) =>
        disputeRole(openFlag, expense, user.id) === "owner" &&
        openFlag.awaiting === "owner" &&
        updatedSinceRaised(openFlag, expense.updatedAt),
    ),
  )
  const editIsNext = Boolean(
    expense?.flags.some((openFlag) => disputeRole(openFlag, expense, user.id) === "owner" && openFlag.awaiting === "owner"),
  ) && !askIsNext

  function flag(note: string) {
    if (!expense) return
    flagging.run(() => flagExpenseAction(expense.id, note), {
      success: `Flagged. ${fullName(expense.createdBy).split(" ")[0]} will take a look`,
      onSuccess: () => setFlagOpen(false),
    })
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
            expense.locked || expense.leftMember ? (
              <p className="flex w-full items-center justify-center gap-2 py-1 text-center text-sm text-muted-foreground">
                <LockIcon className="size-4 shrink-0" aria-hidden />
                {expense.leftMember
                  ? `${expense.leftMember.split(" ")[0]} left the group, so this can't be changed`
                  : "Locked by an approved settlement"}
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
                <Button variant={askIsNext ? "outline" : "default"} className="h-12 rounded-[12px]" onClick={() => onEdit(expense)}>
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

            {expense.flags.map((openFlag) => {
              const role = disputeRole(openFlag, expense, user.id)
              return (
                <section
                  key={openFlag.id}
                  aria-label="Dispute"
                  className="space-y-4 rounded-[16px] bg-warning/8 p-4 ring-1 ring-warning/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <FlagIcon className="size-4 text-warning" aria-hidden /> Disputed
                    </p>
                    <span className="text-xs text-muted-foreground">Still counted in balances</span>
                  </div>
                  <DisputeThread flag={openFlag} viewerId={user.id} nameOf={fullName} />
                  {role ? (
                    <DisputeActions
                      askPrimary={!editIsNext || !canModify}
                      view={{
                        flagId: openFlag.id,
                        description: expense.description,
                        role,
                        awaiting: openFlag.awaiting,
                        flaggerName: fullName(openFlag.userId),
                        ownerName: fullName(expense.createdBy),
                        canEdit: canModify && !expense.locked && !expense.leftMember,
                        updatedSinceRaised: updatedSinceRaised(openFlag, expense.updatedAt),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {openFlag.awaiting === "flagger"
                        ? `Waiting for ${fullName(openFlag.userId).split(" ")[0]} to check it.`
                        : `Waiting for ${fullName(expense.createdBy).split(" ")[0]} to fix it.`}
                    </p>
                  )}
                </section>
              )
            })}

            {canFlag ? (
              <button
                type="button"
                className="mx-auto flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                onClick={() => setFlagOpen(true)}
              >
                <FlagIcon className="size-4" aria-hidden /> Something wrong? Flag it
              </button>
            ) : null}
          </div>
        ) : null}
      </AppSheet>

      <NoteDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        title="Flag this expense"
        description={expense ? `${fullName(expense.createdBy).split(" ")[0]} gets a notification to fix it. Balances don't change meanwhile.` : undefined}
        label="What looks wrong"
        placeholder="e.g. I wasn't at dinner"
        submitLabel="Flag it"
        icon={<FlagIcon />}
        pending={flagging.pending}
        onSubmit={flag}
      />

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
