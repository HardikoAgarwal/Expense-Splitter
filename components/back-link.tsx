"use client"

import { useRouter } from "next/navigation"
import { ChevronLeftIcon } from "lucide-react"

import { useOfflineOptional } from "@/components/offline-provider"
import { cn } from "@/lib/utils"

/**
 * In-app back control. Uses the offline client router when disconnected;
 * otherwise `replace`s so the stack stays app-like.
 */
export function BackLink({
  href,
  label,
  className,
  variant = "chip",
}: {
  href: string
  label: string
  className?: string
  variant?: "chip" | "bar"
}) {
  const router = useRouter()
  const offline = useOfflineOptional()

  function go(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (offline && !offline.online) {
      offline.navigate(href)
      return
    }
    router.replace(href)
  }

  if (variant === "bar") {
    return (
      <a
        href={href}
        onClick={go}
        className={cn(
          "touch-manipulation inline-flex h-9 max-w-[min(100%,11rem)] items-center gap-0.5 rounded-[10px] py-1 pr-2 pl-0.5 text-sm font-medium text-muted-foreground transition active:bg-muted/70 active:text-foreground",
          className,
        )}
      >
        <ChevronLeftIcon className="size-5 shrink-0" aria-hidden />
        <span className="truncate text-foreground">{label}</span>
      </a>
    )
  }

  return (
    <a
      href={href}
      onClick={go}
      className={cn(
        "-ml-1 mb-4 inline-flex h-11 max-w-full touch-manipulation items-center gap-1 rounded-full bg-card/80 pr-4 pl-2 text-sm font-medium text-foreground shadow-xs ring-1 ring-border backdrop-blur transition hover:bg-muted active:scale-[0.98]",
        className,
      )}
    >
      <ChevronLeftIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{label}</span>
    </a>
  )
}
