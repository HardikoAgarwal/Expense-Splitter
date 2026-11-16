export function appBaseUrl(fallback = ""): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "")
  if (configured) return configured
  if (typeof window !== "undefined") return window.location.origin
  return fallback
}

export function accountInviteMessage(input: {
  name: string
  appUrl: string
  email: string
  temporaryPassword: string
  welcomeUrl: string
}): string {
  const first = input.name.trim().split(/\s+/)[0] || input.name
  return [
    `Hey ${first}! I'm inviting you to join Hissa, our app for splitting shared expenses.`,
    `1) Open ${input.appUrl}`,
    `2) Sign in with ${input.email} and this temporary password: ${input.temporaryPassword} (or use this link to set your own: ${input.welcomeUrl})`,
    "3) Change your password from Account. See you there!",
  ].join(" ")
}

export function groupInviteMessage(input: { group: string; appUrl: string; code: string }): string {
  const link = `${input.appUrl.replace(/\/$/, "")}/join/${input.code}`
  return `Hey! Join our group '${input.group}' on Hissa so we can split expenses easily. Open ${link} or enter code ${input.code} in Hissa > Join a group.`
}

export function parseJoinCode(input: string): string {
  const trimmed = input.trim()
  const fromLink = trimmed.match(/join\/([A-Za-z0-9]+)/i)
  return (fromLink?.[1] ?? trimmed).toUpperCase()
}
