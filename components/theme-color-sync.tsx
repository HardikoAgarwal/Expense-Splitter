"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

const LIGHT = "#f6f3ec"
const DARK = "#1c1a17"

/** Keeps the installed PWA status / system nav bar in sync with the app theme. */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const color = resolvedTheme === "dark" ? DARK : LIGHT
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement("meta")
      meta.setAttribute("name", "theme-color")
      document.head.appendChild(meta)
    }
    meta.setAttribute("content", color)

    let apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    if (!apple) {
      apple = document.createElement("meta")
      apple.setAttribute("name", "apple-mobile-web-app-status-bar-style")
      document.head.appendChild(apple)
    }
    // black-translucent lets the page background show behind the status bar on iOS.
    apple.setAttribute("content", resolvedTheme === "dark" ? "black-translucent" : "default")
  }, [resolvedTheme])

  return null
}
