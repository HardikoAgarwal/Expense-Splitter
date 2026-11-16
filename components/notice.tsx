import { InfoIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const tones = {
  neutral: "bg-muted text-foreground",
  warning: "bg-warning/12 text-foreground",
  positive: "bg-positive/10 text-foreground",
  negative: "bg-negative/10 text-foreground",
} as const

export function Notice({
  tone = "neutral",
  title,
  children,
  icon,
  action,
}: {
  tone?: keyof typeof tones
  title: string
  children?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className={cn("flex gap-3 rounded-[16px] px-4 py-3", tones[tone])}>
      <span className="mt-0.5 shrink-0 text-current opacity-80">{icon ?? <InfoIcon className="size-4" />}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {children ? <div className="mt-0.5 text-sm text-muted-foreground">{children}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}
