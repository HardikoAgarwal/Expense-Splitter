import Link from "next/link"
import { ChevronLeftIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** The one back control used across pages: icon + label, 44px tall tap target, room below it. */
export function BackLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "-ml-1 mb-4 inline-flex h-11 max-w-full items-center gap-1 rounded-full bg-card/80 pr-4 pl-2 text-sm font-medium text-foreground shadow-xs ring-1 ring-border backdrop-blur transition hover:bg-muted active:scale-[0.98]",
        className,
      )}
    >
      <ChevronLeftIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  )
}
