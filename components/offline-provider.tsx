"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { discardOutboxItem, loadOfflineSnapshot } from "@/lib/offline/store"
import { flushOutbox, retryOutboxItem } from "@/lib/offline/sync"
import type { OfflineSnapshot, OutboxItem } from "@/lib/offline/types"
import type { GroupCard, GroupDetail, SessionUser } from "@/lib/types"

type OfflineApi = {
  online: boolean
  ready: boolean
  /** Client path used while offline (no RSC). */
  path: string
  snapshot: OfflineSnapshot | null
  outbox: OutboxItem[]
  pendingCount: number
  failedCount: number
  syncing: boolean
  refreshSnapshot: () => Promise<void>
  syncNow: () => Promise<void>
  retryItem: (id: string) => Promise<void>
  discardItem: (id: string) => Promise<void>
  navigate: (href: string) => void
  getCachedGroup: (groupId: string) => GroupDetail | null
  getCachedGroups: () => GroupCard[]
  getCachedUser: () => SessionUser | null
}

const OfflineContext = createContext<OfflineApi | null>(null)

export function useOffline() {
  const value = useContext(OfflineContext)
  if (!value) throw new Error("useOffline must be used inside OfflineProvider")
  return value
}

export function useOfflineOptional() {
  return useContext(OfflineContext)
}

function currentPath() {
  if (typeof window === "undefined") return "/groups"
  return `${window.location.pathname}${window.location.search}` || "/groups"
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [online, setOnline] = useState(true)
  const [ready, setReady] = useState(false)
  const [path, setPath] = useState("/groups")
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null)
  const [syncing, setSyncing] = useState(false)

  const refreshSnapshot = useCallback(async () => {
    try {
      const next = await loadOfflineSnapshot()
      setSnapshot(next)
    } catch {
      setSnapshot(null)
    }
  }, [])

  const navigate = useCallback((href: string) => {
    const next = href.startsWith("/") ? href : `/${href}`
    window.history.pushState({ hissaOffline: true }, "", next)
    setPath(next.split("?")[0] || "/groups")
    document.getElementById("main")?.scrollTo({ top: 0 })
  }, [])

  const syncNow = useCallback(async () => {
    const userId = snapshot?.meta?.userId
    if (!userId || !navigator.onLine) return
    setSyncing(true)
    try {
      const result = await flushOutbox(userId)
      await refreshSnapshot()
      if (result.synced > 0) {
        toast.success(result.synced === 1 ? "1 change synced" : `${result.synced} changes synced`)
        router.refresh()
      }
    } finally {
      setSyncing(false)
    }
  }, [refreshSnapshot, router, snapshot?.meta?.userId])

  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine)
    setPath(currentPath().split("?")[0] || "/groups")
    void refreshSnapshot().finally(() => setReady(true))

    function onOnline() {
      setOnline(true)
      // Rejoin the real App Router at the offline path.
      const href = currentPath()
      router.replace(href)
      router.refresh()
    }
    function onOffline() {
      setOnline(false)
      setPath(currentPath().split("?")[0] || "/groups")
    }
    function onPop() {
      setPath(currentPath().split("?")[0] || "/groups")
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      window.removeEventListener("popstate", onPop)
    }
  }, [refreshSnapshot, router])

  useEffect(() => {
    if (!online || !snapshot?.meta?.userId) return
    if (snapshot.outbox.some((item) => !item.lastError)) void syncNow()
  }, [online, snapshot?.meta?.userId, snapshot?.outbox, syncNow])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && navigator.onLine) void syncNow()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [syncNow])

  const retryItem = useCallback(
    async (id: string) => {
      const userId = snapshot?.meta?.userId
      if (!userId) return
      setSyncing(true)
      try {
        await retryOutboxItem(id, userId)
        await refreshSnapshot()
        router.refresh()
      } finally {
        setSyncing(false)
      }
    },
    [refreshSnapshot, router, snapshot?.meta?.userId],
  )

  const discardItem = useCallback(
    async (id: string) => {
      const userId = snapshot?.meta?.userId
      if (!userId) return
      await discardOutboxItem(id, userId)
      await refreshSnapshot()
      toast.message("Queued change discarded")
    },
    [refreshSnapshot, snapshot?.meta?.userId],
  )

  const api = useMemo<OfflineApi>(() => {
    const outbox = snapshot?.outbox ?? []
    return {
      online,
      ready,
      path,
      snapshot,
      outbox,
      pendingCount: outbox.filter((item) => !item.lastError).length,
      failedCount: outbox.filter((item) => item.lastError).length,
      syncing,
      refreshSnapshot,
      syncNow,
      retryItem,
      discardItem,
      navigate,
      getCachedGroup: (groupId) => {
        if (!snapshot) return null
        return snapshot.details[groupId] ?? null
      },
      getCachedGroups: () => snapshot?.groups ?? [],
      getCachedUser: () => snapshot?.meta?.user ?? null,
    }
  }, [discardItem, navigate, online, path, ready, refreshSnapshot, retryItem, snapshot, syncing, syncNow])

  return <OfflineContext.Provider value={api}>{children}</OfflineContext.Provider>
}
