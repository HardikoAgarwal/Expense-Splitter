"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export function AppSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  tall,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  tall?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={
          tall
            ? "h-[100dvh] max-h-[100dvh] gap-0 overflow-hidden rounded-none border-0 p-0"
            : "max-h-[92dvh] gap-0 overflow-hidden rounded-t-[16px] border-0 p-0"
        }
      >
        {tall ? null : <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted" />}
        <SheetHeader className={tall ? "px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pr-12 pb-2" : "px-4 pt-3 pr-12 pb-2"}>
          <SheetTitle className="text-lg font-semibold tracking-tight">{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">{children}</div>
        {footer ? (
          <div className="shrink-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        ) : (
          <div className="h-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0" />
        )}
      </SheetContent>
    </Sheet>
  )
}
