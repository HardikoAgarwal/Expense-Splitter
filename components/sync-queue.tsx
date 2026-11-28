"use client"

import { CloudOffIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"

import { useOffline } from "@/components/offline-provider"
import { Button } from "@/components/ui/button"
import { formatDay } from "@/lib/money"

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

export function SyncQueueSection() {
  const { outbox, syncing, online, syncNow, retryItem, discardItem, pendingCount, failedCount } = useOffline()

  if (outbox.length === 0) {
    return (
      <section className="rounded-[16px] bg-card px-4 py-4 ring-1 ring-border">
        <h2 className="text-sm font-semibold">Sync queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">No pending offline changes.</p>
      </section>
    )
  }

  return (
    <section className="rounded-[16px] bg-card px-4 py-4 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Sync queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {pendingCount > 0 ? `${pendingCount} waiting` : null}
            {pendingCount > 0 && failedCount > 0 ? " · " : null}
            {failedCount > 0 ? `${failedCount} failed` : null}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!online || syncing || pendingCount === 0}
          onClick={() => void syncNow()}
        >
          <RefreshCwIcon className={syncing ? "animate-spin" : undefined} />
          Sync now
        </Button>
      </div>

      <ul className="mt-4 space-y-2.5">
        {outbox.map((item) => (
          <li key={item.id} className="rounded-[12px] bg-muted/40 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.kind === "delete" ? "Delete" : item.payload?.id ? "Edit" : "Add"} · {formatDay(item.createdAt.slice(0, 10))}
                </p>
                {item.lastError ? <p className="mt-1.5 text-xs text-negative">{item.lastError}</p> : null}
                {!item.lastError ? <p className="mt-1.5 text-xs text-muted-foreground">Waiting to sync</p> : null}
              </div>
              <div className="flex shrink-0 gap-1">
                {item.lastError ? (
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
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
