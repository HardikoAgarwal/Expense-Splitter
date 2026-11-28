import type { Expense, GroupCard, GroupDetail, SaveExpenseInput, SessionUser } from "@/lib/types"

export type OutboxKind = "save" | "delete"

export type OutboxItem = {
  id: string
  kind: OutboxKind
  /** Client temp id for new expenses (offline-…) or server id for edits/deletes. */
  expenseId: string
  groupId: string
  payload: SaveExpenseInput | null
  createdAt: string
  attempts: number
  lastError: string | null
  /** Description snapshot for the sync queue UI. */
  label: string
}

export type OfflineMeta = {
  userId: string
  user: SessionUser
  updatedAt: string
}

export type OfflineSnapshot = {
  meta: OfflineMeta | null
  groups: GroupCard[]
  details: Record<string, GroupDetail>
  outbox: OutboxItem[]
}

export type PendingExpenseMark = {
  expenseId: string
  status: "pending" | "failed"
}

/** Expense extended with offline sync state for UI badges. */
export type LocalExpense = Expense & {
  offlineStatus?: "pending" | "failed"
}
