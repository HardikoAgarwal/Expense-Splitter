"use client"

import { useEffect } from "react"

import { useOfflineOptional } from "@/components/offline-provider"
import { saveGroupDetailSnapshot, saveGroupsSnapshot, saveSessionSnapshot } from "@/lib/offline/store"
import type { GroupCard, GroupDetail, SessionUser } from "@/lib/types"

/** Persists the latest online server payload into IndexedDB for offline use. */
export function OfflineHydrator({
  user,
  groups,
  group,
}: {
  user?: SessionUser | null
  groups?: GroupCard[] | null
  group?: GroupDetail | null
}) {
  const offline = useOfflineOptional()

  useEffect(() => {
    if (!offline?.online) return
    let cancelled = false
    async function persist() {
      try {
        if (user) await saveSessionSnapshot(user)
        if (groups) await saveGroupsSnapshot(groups)
        if (group) await saveGroupDetailSnapshot(group)
        if (!cancelled) await offline?.refreshSnapshot()
      } catch {
        // IndexedDB may be blocked (private mode); ignore.
      }
    }
    void persist()
    return () => {
      cancelled = true
    }
  }, [group, groups, offline, offline?.online, offline?.refreshSnapshot, user])

  return null
}
