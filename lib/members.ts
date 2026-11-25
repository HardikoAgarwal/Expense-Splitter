import { memberExitBlockReason } from "@/lib/group-access"
import type { GroupDetail } from "@/lib/types"

/** Name of someone in the group, including people who have since left. */
export function memberNameIn(group: Pick<GroupDetail, "members" | "formerMembers">, id: string, fallback = "Someone"): string {
  return (
    group.members.find((member) => member.id === id)?.displayName ??
    group.formerMembers.find((member) => member.id === id)?.displayName ??
    fallback
  )
}

/** Why this person cannot leave (or be removed) right now, or null. */
export function exitBlockFor(
  group: GroupDetail,
  targetId: string,
  viewerId: string,
  options: { ignoreMoney?: boolean } = {},
): string | null {
  const target = group.members.find((member) => member.id === targetId)
  if (!target) return "That person is not in the group"
  return memberExitBlockReason({
    self: targetId === viewerId,
    role: target.role,
    adminCount: group.members.filter((member) => member.role === "admin").length,
    memberCount: group.members.length,
    ignoreMoney: options.ignoreMoney,
    netPaise: group.balances.find((balance) => balance.userId === targetId)?.netPaise ?? 0,
    pendingCount: group.settlements.filter(
      (settlement) =>
        settlement.status === "pending" && (settlement.fromUserId === targetId || settlement.toUserId === targetId),
    ).length,
  })
}

export type WriteOffPreview = {
  /** Whether the person being removed owes the group or is owed by it. */
  direction: "owes" | "owed"
  totalPaise: number
  lines: { name: string; amountPaise: number }[]
  pendingPayments: number
}

/**
 * What an admin forgives by removing someone with an unsettled balance. The lines come from
 * the group's simplified debts, which are exactly who the leaver owes or is owed by, so
 * everyone else's balance stays correct.
 */
export function writeOffPreview(group: GroupDetail, targetId: string): WriteOffPreview {
  const owes = (group.balances.find((balance) => balance.userId === targetId)?.netPaise ?? 0) < 0
  const lines = group.debts
    .filter((debt) => (owes ? debt.fromUserId === targetId : debt.toUserId === targetId))
    .map((debt) => ({
      name: memberNameIn(group, owes ? debt.toUserId : debt.fromUserId).split(" ")[0],
      amountPaise: debt.amountPaise,
    }))
  return {
    direction: owes ? "owes" : "owed",
    totalPaise: lines.reduce((sum, line) => sum + line.amountPaise, 0),
    lines,
    pendingPayments: group.settlements.filter(
      (settlement) =>
        settlement.status === "pending" && (settlement.fromUserId === targetId || settlement.toUserId === targetId),
    ).length,
  }
}
