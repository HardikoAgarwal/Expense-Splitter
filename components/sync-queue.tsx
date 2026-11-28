"use client"

import { CloudOffIcon, PlusIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"

import { Section } from "@/components/section"
import { useOffline } from "@/components/offline-provider"
import { Button } from "@/components/ui/button"
import { formatDay } from "@/lib/money"
import { cn } from "@/lib/utils"

export function OfflineStatusPill() {
  const { online, pendingCount, failedCount } = useOffline()
  if (online && pendingCount === 0 && failedCount === 0) return null
  return (
    <div className="pointer-events-none fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-40 -translate-x-1/2 md:top-3">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/90 px-3 py-1 text-[11px] font-semibold text-background shadow-sm">
        <CloudOffIcon className="size-3.5" aria-hidden />
        {!online
          ? "Offline"
          : failedCount > 0
            ? `${failedCount} sync ${failedCount === 1 ? "issue" : "issues"}`
            : `${pendingCount} waiting to sync`}
      </span>
    </div>
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
                  onClick={() => void discardItem(item.id)}
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
  )
}
