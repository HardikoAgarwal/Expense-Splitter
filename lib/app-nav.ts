/** Root destinations switched via the bottom / side nav — use history replace, not push. */
export const APP_TAB_HREFS = ["/groups", "/activity", "/summary", "/account"] as const

export function isAppTabHref(href: string) {
  const path = href.split("?")[0] ?? href
  return (APP_TAB_HREFS as readonly string[]).includes(path)
}

/** Routes with no useful offline UI — block navigation and tip the user instead. */
export function isOfflineBlockedHref(href: string) {
  const path = href.split("?")[0] ?? href
  if (path === "/summary" || path.startsWith("/summary/")) return true
  if (path.includes("/settle")) return true
  if (path.endsWith("/summary")) return true
  return false
}

export const OFFLINE_UNAVAILABLE_MESSAGE = "Unavailable offline"
