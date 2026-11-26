import type { DisputeEvent, DisputeTask, Expense, ExpenseFlag } from "@/lib/types"

/**
 * Dispute rules
 * - Anyone with a share, except the person who added the expense, can flag it.
 * - The person who added it (or paid, if different) fixes it and asks the flagger to resolve.
 * - Only the flagger can resolve it, or answer "still wrong" to send it back.
 */

/**
 * Dispute steps that always leave a Needs you entry for the recipient. Their notices are
 * kept for history but not shown or counted as "new", so nothing is counted twice.
 */
export const TASK_NOTICE_KINDS = ["flagged", "resolve_requested", "still_wrong"] as const

export function isTaskNotice(kind: string): boolean {
  return (TASK_NOTICE_KINDS as readonly string[]).includes(kind)
}

export const ONLY_FLAGGER_MESSAGE = "Only the person who flagged it can resolve it"

export function flagBlockReason(input: { sharePaise: number; actorId: string; creatorId: string }): string | null {
  if (input.actorId === input.creatorId) return "You added this expense. Edit it instead of flagging it"
  if (!Number.isInteger(input.sharePaise) || input.sharePaise <= 0) return "Only someone with a share can flag this"
  return null
}

/** A group admin may close a dispute when the creator and payer have both left, since nobody is left to answer it. */
export function resolveFlagBlockReason(input: {
  actorId: string
  flaggerId: string
  adminCanClose?: boolean
}): string | null {
  return input.actorId === input.flaggerId || input.adminCanClose ? null : ONLY_FLAGGER_MESSAGE
}

export function stillWrongBlockReason(input: {
  actorId: string
  flaggerId: string
  awaiting: ExpenseFlag["awaiting"]
}): string | null {
  if (input.actorId !== input.flaggerId) return "Only the person who flagged it can answer"
  if (input.awaiting !== "flagger") return "They haven't asked you to resolve it yet"
  return null
}

export function requestResolveBlockReason(input: {
  actorId: string
  creatorId: string
  payerId: string
  awaiting: ExpenseFlag["awaiting"]
}): string | null {
  if (input.actorId !== input.creatorId && input.actorId !== input.payerId) {
    return "Only the person who added or paid for this expense can ask"
  }
  if (input.awaiting === "flagger") return "Already asked. Waiting for them to reply"
  return null
}

/** How the viewer relates to a dispute: the flagger, the owner (creator or payer) or neither. */
export function disputeRole(
  flag: Pick<ExpenseFlag, "userId">,
  expense: Pick<Expense, "createdBy" | "payerId">,
  userId: string,
): "flagger" | "owner" | null {
  if (flag.userId === userId) return "flagger"
  if (expense.createdBy === userId || expense.payerId === userId) return "owner"
  return null
}

/** True when the next move on this dispute is the viewer's. */
export function disputeNeedsMe(
  flag: Pick<ExpenseFlag, "userId" | "awaiting">,
  expense: Pick<Expense, "createdBy" | "payerId">,
  userId: string,
): boolean {
  const role = disputeRole(flag, expense, userId)
  return (role === "owner" && flag.awaiting === "owner") || (role === "flagger" && flag.awaiting === "flagger")
}

/** When the dispute last landed back with the owner (flagged or "still wrong"). */
export function lastRaisedAt(flag: Pick<ExpenseFlag, "createdAt" | "events">): string {
  const raised = flag.events.filter((event) => event.kind === "flagged" || event.kind === "still_wrong")
  return raised.at(-1)?.createdAt ?? flag.createdAt
}

/** The owner changed the expense after it was last raised, so asking to resolve is the obvious next step. */
export function updatedSinceRaised(flag: Pick<ExpenseFlag, "createdAt" | "events">, expenseUpdatedAt: string): boolean {
  return expenseUpdatedAt > lastRaisedAt(flag)
}

/** The latest note from either side, for a one-line summary. */
export function latestNote(events: DisputeEvent[]): DisputeEvent | null {
  return [...events].reverse().find((event) => event.note) ?? null
}

export function disputedExpensesInRange(expenses: Expense[], upToDate: string): Expense[] {
  return expenses.filter((expense) => expense.disputed && expense.expenseDate <= upToDate)
}

/** An open flag with just enough of its expense to place it and decide who acts next. */
export type OpenFlag = {
  flag: ExpenseFlag
  expenseId: string
  groupId: string
  groupName: string
  description: string
  amountPaise: number
  createdBy: string
  payerId: string
  updatedAt: string
}

/** Activity → Needs you: one entry per open dispute where the next move is the viewer's. */
export function disputeTasks(
  flags: OpenFlag[],
  userId: string,
  nameOf: (id: string) => string,
): DisputeTask[] {
  const tasks: DisputeTask[] = []
  for (const item of flags) {
    const { flag } = item
    if (!disputeNeedsMe(flag, item, userId)) continue
    const role = disputeRole(flag, item, userId)
    if (!role) continue
    const last = flag.events.at(-1)
    const ownerId = flag.events.findLast((event) => event.kind === "resolve_requested")?.actorId ?? item.createdBy
    tasks.push({
      flagId: flag.id,
      expenseId: item.expenseId,
      groupId: item.groupId,
      groupName: item.groupName,
      description: item.description,
      amountPaise: item.amountPaise,
      role,
      flaggerId: flag.userId,
      flaggerName: nameOf(flag.userId),
      ownerId,
      ownerName: nameOf(ownerId),
      reason: flag.reason,
      note: role === "flagger" ? (last?.kind === "resolve_requested" ? last.note : null) : last?.kind === "still_wrong" ? last.note : null,
      lastKind: last?.kind ?? "flagged",
      updatedSinceRaised: updatedSinceRaised(flag, item.updatedAt),
      canEdit: item.createdBy === userId,
      at: last?.createdAt ?? flag.createdAt,
    })
  }
  return tasks.sort((a, b) => b.at.localeCompare(a.at))
}

/** Short status for a disputed expense in a list, from the viewer's side. */
export function disputeChip(flag: ExpenseFlag, viewerId: string, nameOf: (id: string) => string): string {
  if (flag.awaiting === "flagger") {
    return flag.userId === viewerId ? "Your call" : `Awaiting ${nameOf(flag.userId).split(" ")[0]}`
  }
  return "Disputed"
}
