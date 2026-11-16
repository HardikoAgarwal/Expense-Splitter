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
