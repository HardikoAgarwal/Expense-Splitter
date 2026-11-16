import { cn } from "@/lib/utils"

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("mt-6", className)}>
      {title ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}
