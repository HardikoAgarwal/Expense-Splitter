/** Only the person who added an expense can edit or delete it. */
export const ONLY_CREATOR_MESSAGE = "Only the person who added this expense can edit or delete it"

export function canModifyExpense(expense: { createdBy: string } | null | undefined, userId: string): boolean {
  return Boolean(expense && userId && expense.createdBy === userId)
}
