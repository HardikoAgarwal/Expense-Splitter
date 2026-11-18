import { categoryLabel } from "@/lib/categories"
import { formatDay, formatINR } from "@/lib/money"
import type { NoticeKind } from "@/lib/types"

/** What an expense looked like at one moment; enough to describe a change to it. */
export type ExpenseSnapshot = {
  id: string
  groupId: string
  description: string
  amountPaise: number
  payerId: string
  expenseDate: string
  category: string | null
  createdBy: string
  shares: { userId: string; sharePaise: number }[]
}

export type { NoticeKind }

const shareOf = (snapshot: ExpenseSnapshot, userId: string) =>
  snapshot.shares.find((share) => share.userId === userId)?.sharePaise ?? 0
const sharers = (snapshot: ExpenseSnapshot) =>
  new Set(snapshot.shares.filter((share) => share.sharePaise > 0).map((share) => share.userId))

/**
 * Who hears about an edit. People newly added to the split already get an "added"
 * notice, so they are listed separately; everyone else who had or has a share gets
 * an "edited" notice. The editor never notifies themselves.
 */
export function editRecipients(before: ExpenseSnapshot, after: ExpenseSnapshot, actorId: string) {
  const old = sharers(before)
  const now = sharers(after)
  const added = [...now].filter((id) => !old.has(id) && id !== actorId)
  const edited = [...new Set([...old, ...now])].filter((id) => id !== actorId && !added.includes(id))
  return { added, edited }
}

export function deleteRecipients(before: ExpenseSnapshot, actorId: string) {
  return [...sharers(before)].filter((id) => id !== actorId)
}

/**
 * A short, recipient-specific summary of an edit, e.g.
 * "₹1,200 → ₹1,500 · your share ₹600 → ₹750". Null when nothing they would care about changed.
 */
export function describeEdit(
  before: ExpenseSnapshot,
  after: ExpenseSnapshot,
  recipientId: string,
  nameOf: (id: string) => string,
): string | null {
  const parts: string[] = []
  if (before.amountPaise !== after.amountPaise) parts.push(`${formatINR(before.amountPaise)} → ${formatINR(after.amountPaise)}`)
  if (before.description.trim() !== after.description.trim()) parts.push(`renamed from “${before.description.trim()}”`)
  if (before.expenseDate !== after.expenseDate) parts.push(`date ${formatDay(before.expenseDate)} → ${formatDay(after.expenseDate)}`)
  if (before.payerId !== after.payerId) parts.push(`now paid by ${after.payerId === recipientId ? "you" : nameOf(after.payerId)}`)
  if ((before.category ?? null) !== (after.category ?? null)) {
    parts.push(`category ${categoryLabel(before.category)} → ${categoryLabel(after.category)}`)
  }
  const mineBefore = shareOf(before, recipientId)
  const mineAfter = shareOf(after, recipientId)
  if (mineBefore !== mineAfter) {
    parts.push(mineAfter === 0 ? "you're no longer in the split" : `your share ${formatINR(mineBefore)} → ${formatINR(mineAfter)}`)
  } else {
    const key = (snapshot: ExpenseSnapshot) =>
      snapshot.shares
        .filter((share) => share.sharePaise > 0)
        .map((share) => `${share.userId}:${share.sharePaise}`)
        .sort()
        .join(",")
    if (key(before) !== key(after)) parts.push("split changed")
  }
  return parts.length ? parts.join(" · ") : null
}

export function describeDelete(before: ExpenseSnapshot, recipientId: string): string {
  const mine = shareOf(before, recipientId)
  return mine > 0 ? `${formatINR(before.amountPaise)} · your share was ${formatINR(mine)}` : formatINR(before.amountPaise)
}

/** The headline for a notice, e.g. "Aarav changed Groceries". */
export function noticeTitle(kind: NoticeKind, actorFirstName: string, description: string) {
  switch (kind) {
    case "edited":
      return `${actorFirstName} changed ${description}`
    case "deleted":
      return `${actorFirstName} deleted ${description}`
    case "flagged":
      return `${actorFirstName} flagged ${description}`
    case "resolve_requested":
      return `${actorFirstName} asked you to resolve ${description}`
    case "still_wrong":
      return `${actorFirstName} says ${description} is still wrong`
    case "resolved":
      return `${actorFirstName} resolved the dispute on ${description}`
    default:
      return `${actorFirstName} added you to ${description}`
  }
}
