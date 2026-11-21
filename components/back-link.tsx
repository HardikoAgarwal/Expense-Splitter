import Link from "next/link"
import { ChevronLeftIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Shared back control. `chip` is the page control; `bar` sits inside the mobile top nav. */
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
  if (variant === "bar") {
    return (
      <Link
        href={href}
        className={cn(
          "touch-manipulation inline-flex h-10 max-w-[min(100%,14rem)] items-center gap-0.5 rounded-full py-1 pr-2.5 pl-1 text-sm font-medium text-foreground transition active:bg-muted/70",
          className,
        )}
      >
        <ChevronLeftIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{label}</span>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className={cn(
        "-ml-1 mb-4 inline-flex h-11 max-w-full touch-manipulation items-center gap-1 rounded-full bg-card/80 pr-4 pl-2 text-sm font-medium text-foreground shadow-xs ring-1 ring-border backdrop-blur transition hover:bg-muted active:scale-[0.98]",
        className,
      )}
    >
      <ChevronLeftIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  )
}
