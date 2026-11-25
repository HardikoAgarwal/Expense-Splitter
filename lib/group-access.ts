import { formatINR } from "@/lib/money"

export type GroupRole = "admin" | "member"

export function normalizeGroupRole(role: string | null | undefined): GroupRole {
  return role === "admin" || role === "owner" ? "admin" : "member"
}

export function groupAdminBlockReason(role: string | null | undefined): string | null {
  if (normalizeGroupRole(role) !== "admin") return "Only a group admin can do that"
  return null
}

export function removeMemberBlockReason(input: {
  actorRole: GroupRole | string
  targetRole: GroupRole | string
  adminCount: number
}): string | null {
  const blocked = groupAdminBlockReason(normalizeGroupRole(input.actorRole))
  if (blocked) return blocked
  if (normalizeGroupRole(input.targetRole) === "admin" && input.adminCount <= 1) {
    return "A group needs at least one admin"
  }
  return null
}

export function promoteMemberBlockReason(input: {
  actorRole: GroupRole | string
  targetRole: GroupRole | string
}): string | null {
  const blocked = groupAdminBlockReason(normalizeGroupRole(input.actorRole))
  if (blocked) return blocked
  if (normalizeGroupRole(input.targetRole) === "admin") return "They are already an admin"
  return null
}

/**
 * Why someone cannot leave (or be removed from) a group right now, or null when they can.
 * They must be settled up: no balance and no payment waiting for approval. Mirrors
 * `member_exit_block` in the database.
 */
export function memberExitBlockReason(input: {
  self: boolean
  role: GroupRole | string
  adminCount: number
  memberCount: number
  netPaise: number
  pendingCount: number
}): string | null {
  if (input.memberCount <= 1) return "You are the only person here. Delete the group instead."
  if (normalizeGroupRole(input.role) === "admin" && input.adminCount <= 1) {
    return input.self ? "Make someone else an admin before you leave." : "A group needs at least one admin"
  }
  if (input.netPaise !== 0) {
    const amount = formatINR(Math.abs(input.netPaise))
    if (input.self) {
      return input.netPaise < 0
        ? `You still owe ${amount} in this group. Settle up first.`
        : `You are still owed ${amount} in this group. Settle up first.`
    }
    return input.netPaise < 0 ? `They still owe ${amount}. Settle up first.` : `They are still owed ${amount}. Settle up first.`
  }
  if (input.pendingCount > 0) {
    return input.self
      ? "You have a payment waiting for approval. Resolve it first."
      : "They have a payment waiting for approval. Resolve it first."
  }
  return null
}
