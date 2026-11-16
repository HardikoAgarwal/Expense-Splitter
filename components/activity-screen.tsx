"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Notice } from "@/components/notice"
import { Person } from "@/components/person"
import { Section } from "@/components/section"
import { ShowList } from "@/components/show-list"
import { Button } from "@/components/ui/button"
import { markNoticeSeenAction, resolveSettlementAction } from "@/lib/actions"
import { formatINR } from "@/lib/money"
import type { ActivityItem, ShareNotice } from "@/lib/types"
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
  const router = useRouter()

  async function resolve(id: string, approve: boolean) {
    const result = await resolveSettlementAction(id, approve)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(approve ? "Payment approved" : "Payment declined")
    router.refresh()
  }

  return (
    <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Activity</p>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight">What moved</h1>

      {notices.some((notice) => !notice.seen) ? (
        <Section title="New for you">
          <ul className="space-y-2">
            {notices
              .filter((notice) => !notice.seen)
              .map((notice) => (
                <li key={notice.id}>
                  <Link
                    href={`/groups/${notice.groupId}`}
                    onClick={() => void markNoticeSeenAction(notice.id)}
                    className="flex items-center gap-3 rounded-[16px] bg-card px-3 py-3 ring-1 ring-border"
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
                  <Button variant="outline" className="h-11 rounded-[12px]" onClick={() => void resolve(item.settlementId!, false)}>
                    Reject
                  </Button>
                  <Button className="h-11 rounded-[12px]" onClick={() => void resolve(item.settlementId!, true)}>
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
