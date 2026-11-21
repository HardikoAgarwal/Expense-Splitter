"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

const LIGHT = "#f6f3ec"
const DARK = "#1c1a17"

/** Keeps theme-color in sync with the in-app theme. Avoids black-translucent — it breaks first-tap on iOS PWAs. */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    const color = resolvedTheme === "dark" ? DARK : LIGHT
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", color)
  }, [resolvedTheme])

  return null
}
