import { deleteExpenseAction, saveExpenseAction } from "@/lib/actions"
import type { SaveExpenseInput } from "@/lib/types"

import {
  applyOutboxToGroup,
  isClientExpenseId,
  putOutboxItem,
  readGroupDetailSnapshot,
  readOutbox,
  removeOutboxItem,
  saveGroupDetailSnapshot,
} from "@/lib/offline/store"
import type { OutboxItem } from "@/lib/offline/types"

let flushing = false

export type SyncProgress = {
  running: boolean
  lastError: string | null
}

async function touchGroupAfterSync(groupId: string, userId: string) {
  const detail = await readGroupDetailSnapshot(groupId)
  if (!detail) return
  const merged = applyOutboxToGroup(detail, await readOutbox(), userId)
  await saveGroupDetailSnapshot(merged)
}

export async function flushOutbox(userId: string): Promise<{ synced: number; failed: number }> {
  if (flushing) return { synced: 0, failed: 0 }
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, failed: 0 }

  flushing = true
  let synced = 0
  let failed = 0
  try {
    const queue = await readOutbox()
    for (const item of queue) {
      // Skip previously failed items unless caller cleared lastError (Retry does that).
      if (item.lastError) {
        failed += 1
        continue
      }
      const result = await replayItem(item)
      if (result.ok) {
        await removeOutboxItem(item.id)
        synced += 1
        await touchGroupAfterSync(item.groupId, userId)
      } else {
        await putOutboxItem({
          ...item,
          attempts: item.attempts + 1,
          lastError: result.error,
        })
        failed += 1
      }
    }
  } finally {
    flushing = false
  }
  return { synced, failed }
}

async function replayItem(item: OutboxItem): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (item.kind === "delete") {
      const result = await deleteExpenseAction(item.expenseId)
      if (!result.ok) return { ok: false, error: result.error }
      // Drop from local snapshot if still present.
      const detail = await readGroupDetailSnapshot(item.groupId)
      if (detail) {
        await saveGroupDetailSnapshot({
          ...detail,
          expenses: detail.expenses.filter((expense) => expense.id !== item.expenseId),
        })
      }
      return { ok: true }
    }

    if (!item.payload) return { ok: false, error: "Missing expense payload" }
    const payload: SaveExpenseInput = {
      ...item.payload,
      id: item.payload.id && !isClientExpenseId(item.payload.id) ? item.payload.id : undefined,
      clientMutationId:
        item.payload.clientMutationId ??
        (isClientExpenseId(item.expenseId) ? item.expenseId : undefined),
    }
    // Editing a server expense keeps its id.
    if (!isClientExpenseId(item.expenseId) && !payload.id) payload.id = item.expenseId

    const result = await saveExpenseAction(payload)
    if (!result.ok) return { ok: false, error: result.error }

    const serverId = result.data
    const detail = await readGroupDetailSnapshot(item.groupId)
    if (detail) {
      const expenses = detail.expenses.map((expense) =>
        expense.id === item.expenseId
          ? {
              ...expense,
              id: serverId,
              description: payload.description.trim(),
              amountPaise: payload.amountPaise,
              payerId: payload.payerId,
              expenseDate: payload.expenseDate,
              category: payload.category,
              shares: payload.shares,
              updatedAt: new Date().toISOString(),
            }
          : expense,
      )
      // If it wasn't in the list yet, leave applyOutbox to handle; after remove it's the server list via router refresh.
      await saveGroupDetailSnapshot({ ...detail, expenses })
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Network problem. Check your connection and try again." }
  }
}

export async function retryOutboxItem(id: string, userId: string) {
  const items = await readOutbox()
  const item = items.find((entry) => entry.id === id)
  if (!item) return
  await putOutboxItem({ ...item, lastError: null })
  return flushOutbox(userId)
}

export function isFlushing() {
  return flushing
}
