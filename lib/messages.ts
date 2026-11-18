export function appBaseUrl(fallback = ""): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "")
  if (configured) return configured
  if (typeof window !== "undefined") return window.location.origin
  return fallback
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim()
}

/**
 * Short invite for a new account. Formatted for WhatsApp-style chats: a greeting,
 * the link on its own line, then the sign-in details on their own lines.
 */
export function accountInviteMessage(input: {
  name: string
  email: string
  temporaryPassword: string
  welcomeUrl: string
}): string {
  return [
    `Hi ${firstName(input.name)} 👋 You're invited to Hissa, our app for splitting flat expenses.`,
    "",
    "Set your password here:",
    input.welcomeUrl,
    "",
    "Or sign in with:",
    `Email: ${input.email}`,
    `Temporary password: ${input.temporaryPassword}`,
  ].join("\n")
}

export function groupJoinLink(appUrl: string, code: string) {
  return `${appUrl.replace(/\/$/, "")}/join/${code}`
}

/** Short group invite: who it is for, the link on its own line, and the code as a fallback. */
export function groupInviteMessage(input: { group: string; appUrl: string; code: string }): string {
  return [
    `Join *${input.group}* on Hissa so we can split our expenses 🏠`,
    "",
    groupJoinLink(input.appUrl, input.code),
    "",
    `Or open Hissa → Join and enter code *${input.code}*`,
  ].join("\n")
}

export function parseJoinCode(input: string): string {
  const trimmed = input.trim()
  const fromLink = trimmed.match(/join\/([A-Za-z0-9]+)/i)
  return (fromLink?.[1] ?? trimmed).toUpperCase()
}
