/** Root destinations switched via the bottom / side nav — use history replace, not push. */
export const APP_TAB_HREFS = ["/groups", "/activity", "/summary", "/account"] as const

export function isAppTabHref(href: string) {
  const path = href.split("?")[0] ?? href
  return (APP_TAB_HREFS as readonly string[]).includes(path)
}
