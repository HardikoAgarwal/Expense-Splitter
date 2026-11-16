import { randomBytes } from "node:crypto"

export type AccessProfile = {
  id?: string
  isAdmin: boolean
  disabled: boolean
  invited: boolean
}

/** Why this profile cannot sign in, or null when access is allowed. */
export function signInBlockReason(profile: AccessProfile | null): string | null {
  if (!profile || (!profile.invited && !profile.isAdmin)) {
    return "Access is by invite only"
  }
  if (profile.disabled) return "This account is disabled"
  return null
}

export function adminBlockReason(actor: AccessProfile | null): string | null {
  if (!actor || actor.disabled || !actor.isAdmin) return "Only an admin can do that"
  return null
}

export function mutateUserBlockReason(actor: AccessProfile | null, targetId: string): string | null {
  const blocked = adminBlockReason(actor)
  if (blocked) return blocked
  if (actor?.id && actor.id === targetId) return "You cannot change your own access"
  return null
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

export function generateSecret(length: number): string {
  const bytes = randomBytes(length)
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("")
}
