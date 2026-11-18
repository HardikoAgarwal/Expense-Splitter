"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CheckCheckIcon } from "lucide-react"

import { Notice } from "@/components/notice"
import { Person } from "@/components/person"
import { Section } from "@/components/section"
import { ShowList } from "@/components/show-list"
import { Button } from "@/components/ui/button"
import { markNoticesSeenAction, resolveSettlementAction } from "@/lib/actions"
import { formatINR } from "@/lib/money"
import type { ActivityItem, ShareNotice } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export function ActivityScreen({
  pending,
  notices,
  feed,
}: {
  pending: ActivityItem[]
  notices: ShareNotice[]
  feed: ActivityItem[]
}) {
  const { pending: busy, run } = useAction()
  const seenRunner = useAction()
  const markAll = useAction()
  // Notices that were new when this visit started keep a "New" tag until you leave,
  // even after they are marked seen in the background.
  const [fresh] = useState(() => new Set(notices.filter((notice) => !notice.seen).map((notice) => notice.id)))
  const freshNotices = notices.filter((notice) => fresh.has(notice.id))
  const unseenIds = notices.filter((notice) => !notice.seen).map((notice) => notice.id)
  const listRef = useRef<HTMLUListElement>(null)
  const queued = useRef(new Set<string>())
  const sent = useRef(new Set<string>())
  const runSeen = seenRunner.run

  // Mark a notice seen once at least half of it has been on screen for a moment.
  useEffect(() => {
    const list = listRef.current
    if (!list || unseenIds.length === 0 || typeof IntersectionObserver === "undefined") return
    let timer: number | undefined
    const flush = () => {
      const ids = [...queued.current].filter((id) => !sent.current.has(id))
      queued.current.clear()
      if (ids.length === 0) return
      for (const id of ids) sent.current.add(id)
      runSeen(() => markNoticesSeenAction(ids), { toastError: false })
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.noticeId
          if (entry.isIntersecting && id) {
            queued.current.add(id)
            observer.unobserve(entry.target)
          }
        }
        window.clearTimeout(timer)
        timer = window.setTimeout(flush, 900)
      },
      { threshold: 0.5 },
    )
    for (const element of list.querySelectorAll<HTMLElement>("[data-notice-id]")) {
      if (unseenIds.includes(element.dataset.noticeId ?? "")) observer.observe(element)
    }
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-observe only when the unseen set changes
  }, [unseenIds.join(","), runSeen])

  function resolve(id: string, approve: boolean) {
    run(() => resolveSettlementAction(id, approve), {
      success: approve ? "Payment approved" : "Payment declined",
    })
  }

  return (
    <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Activity</p>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight">What moved</h1>

      {freshNotices.length > 0 ? (
        <Section
          title="New for you"
          action={
            unseenIds.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary"
                pending={markAll.pending}
                onClick={() => markAll.run(() => markNoticesSeenAction(null), { success: "All caught up" })}
              >
                {markAll.pending ? null : <CheckCheckIcon />}
                Mark all as seen
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">All caught up</span>
            )
          }
        >
          <ul ref={listRef} className="space-y-2">
            {freshNotices.map((notice) => (
              <li key={notice.id} data-notice-id={notice.id}>
                <Link
                  href={`/groups/${notice.groupId}`}
                  className={cn(
                    "flex items-center gap-3 rounded-[16px] px-3 py-3 ring-1 transition hover:ring-primary/30",
                    notice.seen ? "bg-card ring-border" : "bg-accent/50 ring-primary/20",
                  )}
                >
                  <Person id={notice.actorId} name={notice.actorName} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {notice.actorName.split(" ")[0]} added you to {notice.description}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Your share {formatINR(notice.sharePaise)} · {notice.groupName}
                    </span>
                  </span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">New</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Needs you">
        {pending.length === 0 ? (
          <Notice title="Inbox clear">Payments to you will wait here.</Notice>
        ) : (
          <div className="space-y-4">
            {pending.map((item) => (
              <article key={item.id} className="rounded-[16px] bg-card p-4 ring-1 ring-border">
                <div className="flex items-center gap-3">
                  <Person id={item.actorId} name={item.actorName} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.actorName.split(" ")[0]} paid you {formatINR(item.amountPaise)}</p>
                    <p className="text-sm text-muted-foreground">{item.groupName}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-11 rounded-[12px]" disabled={busy} onClick={() => resolve(item.settlementId!, false)}>
                    Reject
                  </Button>
                  <Button className="h-11 rounded-[12px]" pending={busy} onClick={() => resolve(item.settlementId!, true)}>
                    Approve
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent">
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            <ShowList
              items={feed}
              render={(item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.kind === "settlement" ? `/groups/${item.groupId}/settle` : `/groups/${item.groupId}`}
                  className="flex items-center gap-3 rounded-[16px] bg-card px-3 py-3 ring-1 ring-border"
                >
                  <Person id={item.actorId} name={item.actorName} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold">{formatINR(item.amountPaise)}</span>
                    {item.status ? (
                      <span className={cn("text-[11px] font-medium capitalize", item.status === "approved" ? "text-positive" : item.status === "pending" ? "text-warning" : "text-negative")}>
                        {item.status}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            )}
            />
          </ul>
        )}
      </Section>
    </div>
  )
}
