import { cn } from "@/lib/utils"

/**
 * Shared spacing for forms and section headings, so labels never sit cramped on
 * their inputs and headings have room above the content they introduce.
 */

/** Wrapper for one label + input (+ hint): a 10px gap between each part. */
export const FIELD = "grid gap-2.5"
/** Gap between separate fields in a form. */
export const FIELDS = "grid gap-5"
/** Label text above an input. */
export const FIELD_LABEL = "block text-sm leading-none font-medium"
/** Small uppercase section heading. */
export const SECTION_TITLE = "text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase"

export function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn(FIELD, className)} {...props} />
}

export function FieldLabel({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn(FIELD_LABEL, className)} {...props} />
}

/** An uppercase heading with consistent space (12px) before the content below it. */
export function SectionTitle({
  as: Tag = "h2",
  className,
  ...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3" | "p" }) {
  return <Tag className={cn(SECTION_TITLE, "mb-3", className)} {...props} />
}
