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
  appleWebApp: { capable: true, title: "Hissa", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1a17" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${fraunces.variable} h-full`}>
      <body className="min-h-dvh antialiased">
        <Providers>
          <div className="relative min-h-dvh w-full overflow-x-hidden bg-canvas">
            <div className="relative mx-auto min-h-dvh w-full max-w-6xl overflow-x-hidden bg-background md:shadow-[0_0_0_1px_var(--border)]">
              <div className="top-wash" aria-hidden />
              <div className="relative z-10">{children}</div>
            </div>
          </div>
          <PwaRegister />
        </Providers>
      </body>
    </html>
  )
}
