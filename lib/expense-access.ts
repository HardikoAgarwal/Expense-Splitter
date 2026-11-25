/** Only the person who added an expense can edit or delete it, unless they left and a group admin steps in. */
export const ONLY_CREATOR_MESSAGE = "Only the person who added this expense can edit or delete it"

export function canModifyExpense(
  expense: { createdBy: string } | null | undefined,
  userId: string,
  /** `creatorLeft`: the creator is no longer in the group. `isGroupAdmin`: the viewer administers the group. */
  context?: { creatorLeft?: boolean; isGroupAdmin?: boolean },
): boolean {
  if (!expense || !userId) return false
  if (expense.createdBy === userId) return true
  return Boolean(context?.creatorLeft && context?.isGroupAdmin)
}
