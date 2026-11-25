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

/** Members can invite people to the app; admins and members alike, as long as the account is active. */
export const MEMBER_INVITE_LIMIT = 20

export function inviteBlockReason(actor: AccessProfile | null): string | null {
  if (!actor || actor.disabled || (!actor.invited && !actor.isAdmin)) return "You cannot invite people right now"
  return null
}

export function inviteLimitReason(actor: AccessProfile, invitesSent: number): string | null {
  if (actor.isAdmin || invitesSent < MEMBER_INVITE_LIMIT) return null
  return `You have reached the limit of ${MEMBER_INVITE_LIMIT} invites. Ask an admin for more.`
}

export const SIGNUP_LINK_DAYS = 7

/** Why these sign-up details cannot be used, or null when they are fine. */
export function signupInputReason(input: { name: string; email: string; password: string }): string | null {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 40) return "Name must be 2–40 characters"
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Enter a valid email"
  if (input.password.length < 8) return "Use at least 8 characters"
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
