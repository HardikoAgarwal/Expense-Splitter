"use client"

import { CloudOffIcon } from "lucide-react"

import { AccountScreen } from "@/components/account-screen"
import { GroupsHome } from "@/components/groups-home"
import { GroupScreen } from "@/components/group-screen"
import { useOffline } from "@/components/offline-provider"
import { SyncQueueSection } from "@/components/sync-queue"
import { applyOutboxToGroup } from "@/lib/offline/store"

function NeedsConnection({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 pt-6 pb-8 md:px-0">
      <div className="flex flex-col items-center rounded-[16px] bg-card px-6 py-12 text-center ring-1 ring-border">
        <span className="flex size-12 items-center justify-center rounded-[14px] bg-muted text-muted-foreground">
          <CloudOffIcon className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">{title}</h1>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      <div className="mt-5">
        <SyncQueueSection />
      </div>
    </div>
  )
}

/** Client-only screens from IndexedDB — no Next RSC fetches while offline. */
export function OfflineApp({ path }: { path: string }) {
  const { snapshot, outbox, getCachedGroup } = useOffline()
  const user = snapshot?.meta?.user
  const groups = snapshot?.groups ?? []

  if (!user) {
    return (
      <NeedsConnection
        title="Nothing cached yet"
        body="Open Hissa once while online so groups and expenses can be saved for offline use."
      />
    )
  }

  if (path === "/groups" || path === "/") {
    return <GroupsHome user={user} groups={groups} />
  }

  const groupMatch = path.match(/^\/groups\/([^/]+)\/?$/)
  if (groupMatch) {
    const cached = getCachedGroup(groupMatch[1])
    if (!cached) {
      return (
        <NeedsConnection
          title="Group not cached"
          body="Open this group once while online, then it will be available offline."
        />
      )
    }
    const group = applyOutboxToGroup(cached, outbox, user.id)
    return <GroupScreen group={group} user={user} />
  }

  if (path.startsWith("/account")) {
    return <AccountScreen user={user} people={null} />
  }

  if (path.startsWith("/activity")) {
    return (
      <NeedsConnection
        title="Activity needs a connection"
        body="You can still open cached groups and add expenses offline. Activity catches up when you’re back online."
      />
    )
  }

  if (path.startsWith("/summary") || path.endsWith("/summary") || path.includes("/settle")) {
    return (
      <NeedsConnection
        title="Needs a connection"
        body="Summary and settle stay online-only. Cached groups and expense add/edit still work offline."
      />
    )
  }

  return (
    <NeedsConnection
      title="Unavailable offline"
      body="Go back to Groups to keep browsing your cached data."
    />
  )
}
