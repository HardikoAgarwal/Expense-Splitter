"use client"

import { useEffect } from "react"

/** Keeps CSS vars in sync so dialogs stay inside the visible area above the mobile keyboard. */
export function VisualViewportSync() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport

    function sync() {
      const height = vv?.height ?? window.innerHeight
      const offsetTop = vv?.offsetTop ?? 0
      const keyboard = Math.max(0, window.innerHeight - height - offsetTop)
      root.style.setProperty("--vv-height", `${height}px`)
      root.style.setProperty("--vv-offset-top", `${offsetTop}px`)
      root.style.setProperty("--keyboard-inset", `${keyboard}px`)
    }

    sync()
    vv?.addEventListener("resize", sync)
    vv?.addEventListener("scroll", sync)
    window.addEventListener("resize", sync)
    return () => {
      vv?.removeEventListener("resize", sync)
      vv?.removeEventListener("scroll", sync)
      window.removeEventListener("resize", sync)
    }
  }, [])

  return null
}
