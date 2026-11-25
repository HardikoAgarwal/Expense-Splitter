import type { Share } from "@/lib/types"

/**
 * Equal split in integer paise.
 * Base share is floor(total / n). The remainder (0..n-1 paise) is given,
 * one paisa each, to the first remainder members after sorting user ids
 * lexicographically. The same ids always receive the extra paisa.
 */
export function splitEqually(totalPaise: number, userIds: string[]): Share[] {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0) {
    throw new Error("Amount must be a positive number of paise")
  }
  const ids = [...new Set(userIds)].sort((a, b) => a.localeCompare(b))
  if (ids.length === 0) throw new Error("Choose at least one person")
  const base = Math.floor(totalPaise / ids.length)
  const remainder = totalPaise - base * ids.length
  return ids.map((userId, index) => ({
    userId,
    sharePaise: base + (index < remainder ? 1 : 0),
  }))
}

export function sumShares(shares: Share[]): number {
  return shares.reduce((sum, share) => sum + share.sharePaise, 0)
}

/** Drop people who are not part of the split. Zero shares are not stored. */
export function payableShares(shares: Share[]): Share[] {
  return shares.filter((share) => share.sharePaise > 0)
}

/** Returns an error message, or null when the shares are a valid split. */
export function validateShares(totalPaise: number, shares: Share[]): string | null {
  if (!Number.isInteger(totalPaise) || totalPaise <= 0) {
    return "Enter an amount greater than zero"
  }
  if (shares.length === 0) return "Choose who shares this expense"
  const seen = new Set<string>()
  for (const share of shares) {
    if (seen.has(share.userId)) return "A person can only appear once"
    seen.add(share.userId)
    if (!Number.isInteger(share.sharePaise) || share.sharePaise < 0) {
      return "Each share must be zero or more"
    }
  }
  if (payableShares(shares).length === 0) return "Choose who shares this expense"
  const sum = sumShares(shares)
  if (sum !== totalPaise) {
    const direction = sum > totalPaise ? "over" : "short"
    return `Shares are ${direction} of the total`
  }
  return null
}

export type NetInput = { userId: string; netPaise: number }

export type Transfer = {
  fromUserId: string
  toUserId: string
  amountPaise: number
}

/**
 * Greedy debt simplification: repeatedly match the largest remaining debtor
 * with the largest remaining creditor. Ties break by user id ascending so the
 * result is deterministic. Nets should sum to zero; any leftover dust (they
 * don't) is left unmatched.
 */
export function simplifyDebts(nets: NetInput[]): Transfer[] {
  const creditors = nets
    .filter((net) => net.netPaise > 0)
    .map((net) => ({ userId: net.userId, left: net.netPaise }))
    .sort((a, b) => b.left - a.left || a.userId.localeCompare(b.userId))

  const debtors = nets
    .filter((net) => net.netPaise < 0)
    .map((net) => ({ userId: net.userId, left: -net.netPaise }))
    .sort((a, b) => b.left - a.left || a.userId.localeCompare(b.userId))

  const transfers: Transfer[] = []
  let debtorIndex = 0
  let creditorIndex = 0
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const pay = Math.min(debtors[debtorIndex].left, creditors[creditorIndex].left)
    if (pay > 0) {
      transfers.push({
        fromUserId: debtors[debtorIndex].userId,
        toUserId: creditors[creditorIndex].userId,
        amountPaise: pay,
      })
    }
    debtors[debtorIndex].left -= pay
    creditors[creditorIndex].left -= pay
    if (debtors[debtorIndex].left === 0) debtorIndex += 1
    if (creditors[creditorIndex].left === 0) creditorIndex += 1
  }
  return transfers
}

export type LedgerExpense = {
  payerId: string
  expenseDate: string
  amountPaise: number
  shares: Share[]
}

export type LedgerSettlement = {
  fromUserId: string
  toUserId: string
  amountPaise: number
  status: "pending" | "approved" | "rejected"
  upToDate: string
  resolvedAt?: string | null
  createdAt?: string
  writeOff?: boolean
}

export type MemberBalance = {
  userId: string
  paidPaise: number
  owedPaise: number
  settlementsPaidPaise: number
  settlementsReceivedPaise: number
  netPaise: number
}

/**
 * net = paid − owed shares + approved settlements paid − approved settlements received.
 * Positive means the group owes this person.
 */
export function computeBalances(
  memberIds: string[],
  expenses: LedgerExpense[],
  settlements: LedgerSettlement[],
): MemberBalance[] {
  const balances = new Map<string, MemberBalance>()
  for (const userId of memberIds) {
    balances.set(userId, {
      userId,
      paidPaise: 0,
      owedPaise: 0,
      settlementsPaidPaise: 0,
      settlementsReceivedPaise: 0,
      netPaise: 0,
    })
  }

  for (const expense of expenses) {
    const payer = balances.get(expense.payerId)
    if (payer) payer.paidPaise += expense.amountPaise
    for (const share of expense.shares) {
      const member = balances.get(share.userId)
      if (member) member.owedPaise += share.sharePaise
    }
  }

  for (const settlement of settlements) {
    if (settlement.status !== "approved") continue
    const from = balances.get(settlement.fromUserId)
    const to = balances.get(settlement.toUserId)
    if (from) from.settlementsPaidPaise += settlement.amountPaise
    if (to) to.settlementsReceivedPaise += settlement.amountPaise
  }

  for (const balance of balances.values()) {
    balance.netPaise =
      balance.paidPaise -
      balance.owedPaise +
      balance.settlementsPaidPaise -
      balance.settlementsReceivedPaise
  }

  return [...balances.values()].sort((a, b) => a.userId.localeCompare(b.userId))
}

/** Positive when `me` should pay `other` for activity dated on or before `upToDate`. */
export function pairwiseIOwe(input: {
  me: string
  other: string
  upToDate: string
  expenses: LedgerExpense[]
  settlements: LedgerSettlement[]
}): number {
  let mySharesOnTheirExpenses = 0
  let theirSharesOnMyExpenses = 0
  for (const expense of input.expenses) {
    if (expense.expenseDate > input.upToDate) continue
    if (expense.payerId === input.other) {
      mySharesOnTheirExpenses += expense.shares
        .filter((share) => share.userId === input.me)
        .reduce((sum, share) => sum + share.sharePaise, 0)
    }
    if (expense.payerId === input.me) {
      theirSharesOnMyExpenses += expense.shares
        .filter((share) => share.userId === input.other)
        .reduce((sum, share) => sum + share.sharePaise, 0)
    }
  }

  let iPaidThem = 0
  let theyPaidMe = 0
  for (const settlement of input.settlements) {
    if (settlement.status !== "approved") continue
    if (settlement.upToDate > input.upToDate) continue
    if (settlement.fromUserId === input.me && settlement.toUserId === input.other) {
      iPaidThem += settlement.amountPaise
    }
    if (settlement.fromUserId === input.other && settlement.toUserId === input.me) {
      theyPaidMe += settlement.amountPaise
    }
  }

  return mySharesOnTheirExpenses - theirSharesOnMyExpenses - iPaidThem + theyPaidMe
}

export function lockDate(settlements: LedgerSettlement[]): string | null {
  const dates = settlements
    .filter((settlement) => settlement.status === "approved" && !settlement.writeOff)
    .map((settlement) => settlement.upToDate)
    .sort()
  return dates.length ? dates[dates.length - 1] : null
}

/** When the latest settlement date was locked (approval time), if known. */
export function lockedAt(settlements: LedgerSettlement[]): string | null {
  const through = lockDate(settlements)
  if (!through) return null
  const times = settlements
    .filter((s) => s.status === "approved" && !s.writeOff && s.upToDate === through)
    .map((s) => s.resolvedAt ?? s.createdAt ?? null)
    .filter((t): t is string => Boolean(t))
    .sort()
  return times.length ? times[times.length - 1] : null
}

/**
 * Days before the settled date are locked. On the settled date itself only expenses
 * created before the settlement was approved are locked, so new ones can still be added.
 */
export function isExpenseLocked(
  expenseDate: string,
  lockedThrough: string | null,
  createdAt?: string,
  lockTime?: string | null,
): boolean {
  if (lockedThrough === null) return false
  if (expenseDate < lockedThrough) return true
  if (expenseDate > lockedThrough) return false
  if (!createdAt || !lockTime) return true
  return createdAt < lockTime
}
