"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-[20px] p-0 ring-1 ring-border",
          // A dialog opened from this one (a note, a confirm) takes the focus; this one steps back.
          "transition-[opacity,scale] data-[nested-dialog-open]:scale-[0.96] data-[nested-dialog-open]:opacity-0",
          "top-[calc(var(--vv-offset-top,0px)+var(--vv-height,100dvh)/2)] max-h-[calc(var(--vv-height,100dvh)-1.5rem)]",
          tall && "max-h-[calc(var(--vv-height,100dvh)-1rem)] sm:max-w-lg",
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 px-4 pt-4 pr-12 pb-2 text-left">
          <DialogTitle className="text-lg font-semibold tracking-tight">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-1">{children}</div>
        {footer ? (
          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t bg-transparent p-4 sm:flex-col">
            {footer}
          </DialogFooter>
        ) : (
          <div className="h-4 shrink-0" />
        )}
      </DialogContent>
    </Dialog>
  )
}
