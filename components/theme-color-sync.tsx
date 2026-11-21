"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

const LIGHT = "#f6f3ec"
const DARK = "#1c1a17"

/**
 * Syncs browser / PWA chrome with the app theme.
 * Android: theme-color mainly tints the *status* bar. The system bottom gesture /
 * nav bar usually follows the phone theme and cannot be fully controlled from a PWA.
 * Clearing media-query theme-color tags avoids Next’s prefers-color-scheme metas
 * fighting a manual light/dark choice in Account.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    const dark = resolvedTheme === "dark"
    const color = dark ? DARK : LIGHT

    document.querySelectorAll('meta[name="theme-color"]').forEach((node) => node.remove())
    const meta = document.createElement("meta")
    meta.setAttribute("name", "theme-color")
    meta.setAttribute("content", color)
    document.head.appendChild(meta)

    let apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (!apple) {
      apple = document.createElement("meta")
      apple.setAttribute("name", "apple-mobile-web-app-status-bar-style")
      document.head.appendChild(apple)
    }
    apple.setAttribute("content", dark ? "black-translucent" : "default")

    document.documentElement.style.colorScheme = dark ? "dark" : "light"
  }, [resolvedTheme])

  return null
}
