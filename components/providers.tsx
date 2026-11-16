"use client"

import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="bottom-center" offset={96} duration={2400} />
    </ThemeProvider>
  )
}
