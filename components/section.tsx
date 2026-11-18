import { SECTION_TITLE } from "@/components/field"
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
    <section className={cn("mt-8", className)}>
      {title ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className={SECTION_TITLE}>{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}
