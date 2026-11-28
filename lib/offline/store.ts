import { computeBalances, simplifyDebts } from "@/lib/ledger"
import type { Expense, GroupCard, GroupDetail, SaveExpenseInput, SessionUser } from "@/lib/types"

import { idbClear, idbDelete, idbGet, idbGetAll, idbPut } from "@/lib/offline/db"
import type { OfflineMeta, OfflineSnapshot, OutboxItem } from "@/lib/offline/types"

const META_KEY = "session"
const GROUPS_KEY = "list"

export function newClientExpenseId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `offline-${crypto.randomUUID()}`
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function newOutboxId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function isClientExpenseId(id: string) {
  return id.startsWith("offline-")
}

export async function saveSessionSnapshot(user: SessionUser) {
  const meta: OfflineMeta = { userId: user.id, user, updatedAt: new Date().toISOString() }
  await idbPut("meta", meta, META_KEY)
}

export async function saveGroupsSnapshot(groups: GroupCard[]) {
  await idbPut("groups", groups, GROUPS_KEY)
}

export async function saveGroupDetailSnapshot(group: GroupDetail) {
  await idbPut("details", group)
}

export async function readMeta(): Promise<OfflineMeta | null> {
  return (await idbGet<OfflineMeta>("meta", META_KEY)) ?? null
}

export async function readGroupsSnapshot(): Promise<GroupCard[]> {
  return (await idbGet<GroupCard[]>("groups", GROUPS_KEY)) ?? []
}

export async function readGroupDetailSnapshot(groupId: string): Promise<GroupDetail | null> {
  return (await idbGet<GroupDetail>("details", groupId)) ?? null
}

export async function readOutbox(): Promise<OutboxItem[]> {
  const items = await idbGetAll<OutboxItem>("outbox")
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function putOutboxItem(item: OutboxItem) {
  await idbPut("outbox", item)
}

export async function removeOutboxItem(id: string) {
  await idbDelete("outbox", id)
}

export async function clearOutbox() {
  await idbClear("outbox")
}

export async function loadOfflineSnapshot(): Promise<OfflineSnapshot> {
  const [meta, groups, details, outbox] = await Promise.all([
    readMeta(),
    readGroupsSnapshot(),
    idbGetAll<GroupDetail>("details"),
    readOutbox(),
  ])
  const detailMap: Record<string, GroupDetail> = {}
  for (const detail of details) detailMap[detail.id] = detail
  return { meta, groups, details: detailMap, outbox }
}

function expenseFromSave(input: SaveExpenseInput, expenseId: string, userId: string, existing?: Expense | null): Expense {
  const now = new Date().toISOString()
  return {
    id: expenseId,
    groupId: input.groupId,
    description: input.description.trim(),
    amountPaise: input.amountPaise,
    payerId: input.payerId,
    expenseDate: input.expenseDate,
    category: input.category,
    createdBy: existing?.createdBy ?? userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    shares: input.shares,
    locked: existing?.locked ?? false,
    leftMember: existing?.leftMember ?? null,
    creatorLeft: existing?.creatorLeft ?? false,
    ownerGone: existing?.ownerGone ?? false,
    disputed: existing?.disputed ?? false,
    flags: existing?.flags ?? [],
  }
}

function recomputeGroup(group: GroupDetail, userId: string): GroupDetail {
  const memberIds = group.members.map((member) => member.id)
  const balances = computeBalances(
    memberIds,
    group.expenses.map((expense) => ({
      payerId: expense.payerId,
      amountPaise: expense.amountPaise,
      expenseDate: expense.expenseDate,
      shares: expense.shares,
    })),
    group.settlements.map((settlement) => ({
      fromUserId: settlement.fromUserId,
      toUserId: settlement.toUserId,
      amountPaise: settlement.amountPaise,
      status: settlement.status,
      upToDate: settlement.upToDate,
      createdAt: settlement.createdAt,
      resolvedAt: settlement.resolvedAt,
      writeOff: settlement.writeOff,
    })),
  )
  const debts = simplifyDebts(balances.map((balance) => ({ userId: balance.userId, netPaise: balance.netPaise }))).map(
    (transfer) => ({
      fromUserId: transfer.fromUserId,
      toUserId: transfer.toUserId,
      amountPaise: transfer.amountPaise,
    }),
  )
  const mine = balances.find((balance) => balance.userId === userId)?.netPaise ?? 0
  return { ...group, balances, debts, myNetPaise: mine }
}

/** Apply outbox mutations onto a cached group detail for optimistic UI. */
export function applyOutboxToGroup(group: GroupDetail, outbox: OutboxItem[], userId: string): GroupDetail {
  const relevant = outbox.filter((item) => item.groupId === group.id)
  if (relevant.length === 0) return group

  let expenses = [...group.expenses]
  for (const item of relevant) {
    if (item.kind === "delete") {
      expenses = expenses.filter((expense) => expense.id !== item.expenseId)
      continue
    }
    if (!item.payload) continue
    const existing = expenses.find((expense) => expense.id === item.expenseId) ?? null
    const next = expenseFromSave(item.payload, item.expenseId, userId, existing)
    const index = expenses.findIndex((expense) => expense.id === item.expenseId)
    if (index >= 0) expenses[index] = next
    else expenses = [next, ...expenses]
  }

  const patched = { ...group, expenses }
  return recomputeGroup(patched, userId)
}

export function outboxStatusForExpense(outbox: OutboxItem[], expenseId: string): "pending" | "failed" | null {
  const item = outbox.find((entry) => entry.expenseId === expenseId || (entry.payload?.id === expenseId))
  if (!item) return null
  return item.lastError ? "failed" : "pending"
}

export async function enqueueSave(input: {
  userId: string
  group: GroupDetail
  payload: SaveExpenseInput
  expenseId: string
  label: string
}) {
  const item: OutboxItem = {
    id: newOutboxId(),
    kind: "save",
    expenseId: input.expenseId,
    groupId: input.payload.groupId,
    payload: null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    label: input.label,
  }
  // Client expense ids double as idempotency keys for create retries.
  if (isClientExpenseId(input.expenseId)) {
    item.payload = { ...input.payload, id: undefined, clientMutationId: input.expenseId }
  } else {
    item.payload = { ...input.payload, id: input.expenseId, clientMutationId: input.payload.clientMutationId }
  }

  // Replace an existing pending save for the same expense.
  const existing = (await readOutbox()).filter((entry) => entry.expenseId === input.expenseId && entry.kind === "save")
  for (const prior of existing) await removeOutboxItem(prior.id)

  await putOutboxItem(item)

  const base = (await readGroupDetailSnapshot(input.group.id)) ?? input.group
  const merged = applyOutboxToGroup(base, await readOutbox(), input.userId)
  await saveGroupDetailSnapshot(merged)
  await touchGroupCardNet(merged.id, merged.myNetPaise)
  return item
}

export async function enqueueDelete(input: {
  userId: string
  group: GroupDetail
  expenseId: string
  label: string
}) {
  // If it was only local (never synced), drop the pending save instead of sending a delete.
  const pending = (await readOutbox()).filter((entry) => entry.expenseId === input.expenseId)
  if (isClientExpenseId(input.expenseId)) {
    for (const entry of pending) await removeOutboxItem(entry.id)
    const base = (await readGroupDetailSnapshot(input.group.id)) ?? input.group
    const expenses = base.expenses.filter((expense) => expense.id !== input.expenseId)
    const merged = recomputeGroup({ ...base, expenses }, input.userId)
    await saveGroupDetailSnapshot(merged)
    await touchGroupCardNet(merged.id, merged.myNetPaise)
    return null
  }

  for (const entry of pending.filter((item) => item.kind === "save")) await removeOutboxItem(entry.id)

  const item: OutboxItem = {
    id: newOutboxId(),
    kind: "delete",
    expenseId: input.expenseId,
    groupId: input.group.id,
    payload: null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    label: input.label,
  }
  await putOutboxItem(item)
  const base = (await readGroupDetailSnapshot(input.group.id)) ?? input.group
  const merged = applyOutboxToGroup(base, await readOutbox(), input.userId)
  await saveGroupDetailSnapshot(merged)
  await touchGroupCardNet(merged.id, merged.myNetPaise)
  return item
}

async function touchGroupCardNet(groupId: string, myNetPaise: number) {
  const groups = await readGroupsSnapshot()
  if (groups.length === 0) return
  const next = groups.map((group) => (group.id === groupId ? { ...group, myNetPaise } : group))
  await saveGroupsSnapshot(next)
}

export async function discardOutboxItem(id: string, userId: string) {
  const items = await readOutbox()
  const target = items.find((item) => item.id === id)
  if (!target) return
  await removeOutboxItem(id)
  const detail = await readGroupDetailSnapshot(target.groupId)
  if (!detail) return
  // Reload base without this item: re-apply remaining outbox onto a clean snapshot.
  // We don't keep a pre-outbox base; reconstruct by stripping optimistic rows for this expense then reapplying.
  const remaining = (await readOutbox()).filter((item) => item.id !== id)
  let expenses = detail.expenses.filter((expense) => expense.id !== target.expenseId)
  // Re-apply remaining outbox on a detail that no longer has the discarded expense.
  const cleaned = recomputeGroup({ ...detail, expenses }, userId)
  const merged = applyOutboxToGroup(cleaned, remaining, userId)
  // If discarded a failed edit of a server expense, we lost the original row — keep other expenses;
  // user must refresh online to restore the pre-edit server version.
  await saveGroupDetailSnapshot(merged)
  await touchGroupCardNet(merged.id, merged.myNetPaise)
}
