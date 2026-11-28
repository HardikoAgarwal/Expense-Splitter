"use client"

import { useState } from "react"
import { CloudOffIcon, PlusIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"

import { Section } from "@/components/section"
import { useOffline } from "@/components/offline-provider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDay } from "@/lib/money"
import type { OutboxItem } from "@/lib/offline/types"
import { cn } from "@/lib/utils"

export function OfflineStatusPill({ className }: { className?: string }) {
  const { online, pendingCount, failedCount } = useOffline()
  if (online && pendingCount === 0 && failedCount === 0) return null
  const label = !online
    ? "Offline"
    : failedCount > 0
      ? `${failedCount} sync ${failedCount === 1 ? "issue" : "issues"}`
      : `${pendingCount} to sync`
  return (
    <span
      className={cn(
        "inline-flex max-w-[9.5rem] items-center gap-1 rounded-full bg-foreground/90 px-2.5 py-1 text-[11px] font-semibold text-background shadow-sm",
        className,
      )}
      title={label}
    >
      <CloudOffIcon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  )
}

export function SyncQueueSection({
  hideWhenEmpty = true,
  className,
}: {
  /** When true (default), render nothing if the outbox is empty. */
  hideWhenEmpty?: boolean
  className?: string
}) {
  const { outbox, syncing, online, syncNow, retryItem, discardItem, pendingCount, failedCount } = useOffline()
  const [discardTarget, setDiscardTarget] = useState<OutboxItem | null>(null)
  const [discarding, setDiscarding] = useState(false)

  async function confirmDiscard() {
    if (!discardTarget) return
    setDiscarding(true)
    try {
      await discardItem(discardTarget.id)
      setDiscardTarget(null)
    } finally {
      setDiscarding(false)
    }
  }

  if (outbox.length === 0) {
    if (hideWhenEmpty) return null
    return (
      <Section title="Sync queue" className={className}>
        <p className="text-sm text-muted-foreground">No pending offline changes.</p>
      </Section>
    )
  }

  const subtitle =
    !online
      ? "Saved on this device — syncs when you’re back online."
      : failedCount > 0
        ? `${failedCount} need${failedCount === 1 ? "s" : ""} a retry${pendingCount > failedCount ? ` · ${pendingCount - failedCount} waiting` : ""}`
        : `${pendingCount} waiting to upload`

  return (
    <>
      <Section
        className={className}
        title="Sync queue"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary"
            disabled={!online || syncing || (pendingCount === 0 && failedCount === 0)}
            onClick={() => void syncNow()}
          >
            <RefreshCwIcon className={syncing ? "animate-spin" : undefined} />
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        }
      >
        <p className="-mt-1 mb-3 text-sm text-muted-foreground">{subtitle}</p>
        <ul className="space-y-2">
          {outbox.map((item) => {
            const kind = item.kind === "delete" ? "delete" : item.payload?.id ? "edit" : "add"
            const failed = Boolean(item.lastError)
            const KindIcon = kind === "delete" ? Trash2Icon : kind === "edit" ? PencilIcon : PlusIcon
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-3 rounded-[16px] bg-card px-3 py-3 ring-1",
                  failed ? "ring-negative/25" : "ring-border",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                    failed ? "bg-negative/10 text-negative" : "bg-primary/10 text-primary",
                  )}
                >
                  <KindIcon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {kind === "delete" ? "Delete" : kind === "edit" ? "Edit" : "Add"} · {formatDay(item.createdAt.slice(0, 10))}
                  </p>
                  {failed ? (
                    <p className="mt-1.5 text-xs text-negative">{item.lastError}</p>
                  ) : (
                    <p className="mt-1.5 text-xs font-medium text-primary">Waiting to sync</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-0.5">
                  {failed ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!online || syncing}
                      onClick={() => void retryItem(item.id)}
                      aria-label="Retry"
                    >
                      <RefreshCwIcon />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={syncing}
                    onClick={() => setDiscardTarget(item)}
                    aria-label="Discard"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Dialog open={Boolean(discardTarget)} onOpenChange={(open) => !open && !discarding && setDiscardTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this change?</DialogTitle>
            <DialogDescription>
              {discardTarget
                ? `${discardTarget.label} won’t sync and will be removed from this device. This can’t be undone.`
                : "This can’t be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-[12px]"
              disabled={discarding}
              onClick={() => setDiscardTarget(null)}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11 rounded-[12px]"
              pending={discarding}
              onClick={() => void confirmDiscard()}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
