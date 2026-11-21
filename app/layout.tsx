import type { Metadata, Viewport } from "next"
import { Fraunces, Outfit } from "next/font/google"

import { Providers } from "@/components/providers"
import { PwaRegister } from "@/components/pwa-register"
import "./globals.css"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
})

export const metadata: Metadata = {
  title: { default: "Hissa", template: "%s · Hissa" },
  description: "Split rent, groceries, and the rest of a shared home.",
  applicationName: "Hissa",
  appleWebApp: { capable: true, title: "Hissa", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Default; ThemeColorSync replaces this to match the in-app light/dark choice.
  themeColor: "#f6f3ec",
  colorScheme: "light dark",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-dvh antialiased">
        <Providers>
          <a
            href="#main"
            className="sr-only z-50 rounded-[12px] bg-card px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Skip to content
          </a>
          <div className="relative min-h-dvh w-full bg-background">
            <div className="top-wash" aria-hidden />
            <div className="relative z-10">{children}</div>
          </div>
          <PwaRegister />
        </Providers>
      </body>
    </html>
  )
}
