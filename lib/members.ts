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
export function exitBlockFor(group: GroupDetail, targetId: string, viewerId: string): string | null {
  const target = group.members.find((member) => member.id === targetId)
  if (!target) return "That person is not in the group"
  return memberExitBlockReason({
    self: targetId === viewerId,
    role: target.role,
    adminCount: group.members.filter((member) => member.role === "admin").length,
    memberCount: group.members.length,
    netPaise: group.balances.find((balance) => balance.userId === targetId)?.netPaise ?? 0,
    pendingCount: group.settlements.filter(
      (settlement) =>
        settlement.status === "pending" && (settlement.fromUserId === targetId || settlement.toUserId === targetId),
    ).length,
  })
}
