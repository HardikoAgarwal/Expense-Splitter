"use client"

import { ThemeProvider } from "next-themes"

import { ThemeColorSync } from "@/components/theme-color-sync"
import { VisualViewportSync } from "@/components/visual-viewport"
import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="hissa-theme" disableTransitionOnChange>
      <ThemeColorSync />
      <VisualViewportSync />
      {children}
      <Toaster position="bottom-center" offset={96} duration={2400} />
    </ThemeProvider>
  )
}
