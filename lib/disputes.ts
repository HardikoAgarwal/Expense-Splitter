import type { Expense } from "@/lib/types"

export function flagBlockReason(sharePaise: number): string | null {
  if (!Number.isInteger(sharePaise) || sharePaise <= 0) {
    return "Only someone with a share can flag this"
  }
  return null
}

export function resolveFlagBlockReason(input: {
  actorId: string
  flaggerId: string
  creatorId: string
}): string | null {
  if (input.actorId === input.flaggerId || input.actorId === input.creatorId) return null
  return "Only the person who flagged it, or the person who added it, can resolve it"
}

export function editClearsFlags(input: { actorId: string; creatorId: string; payerId: string }): boolean {
  return input.actorId === input.creatorId || input.actorId === input.payerId
}

export function disputedExpensesInRange(expenses: Expense[], upToDate: string): Expense[] {
  return expenses.filter((expense) => expense.disputed && expense.expenseDate <= upToDate)
}
