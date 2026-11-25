import "server-only"

import { cache } from "react"

import { signInBlockReason } from "@/lib/admin"
import { isCategory } from "@/lib/categories"
import {
  disputeNeedsMe,
  disputeTasks,
  flagBlockReason,
  type OpenFlag,
  requestResolveBlockReason,
  resolveFlagBlockReason,
  stillWrongBlockReason,
  TASK_NOTICE_KINDS,
} from "@/lib/disputes"
import { AppError } from "@/lib/errors"
import { canModifyExpense, ONLY_CREATOR_MESSAGE } from "@/lib/expense-access"
import type { ExpenseSnapshot } from "@/lib/expense-changes"
import { isExpenseLocked, lockDate, lockedAt, type LedgerSettlement } from "@/lib/ledger"
import { createClient } from "@/lib/supabase/server"
import { isValidUpi, normalizeUpi } from "@/lib/upi"
import type {
  ActivityItem,
  DisputeEvent,
  ExpenseFlag,
  Balance,
  Debt,
  Expense,
  GroupCard,
  GroupDetail,
  InvitePreview,
  Member,
  SaveExpenseInput,
  SessionUser,
  Settlement,
  ShareNotice,
  SettlementStatus,
  SummaryExpenseRow,
} from "@/lib/types"

function fail(error: { message: string } | null, fallback?: string): asserts error is null {
  if (error) throw new AppError(fallback ?? error.message)
}

function num(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  return typeof value === "number" ? value : Number(value)
}

type FlagExpenseEmbed = {
  group_id: string
  created_by: string
  payer_id: string
  description: string
  amount_paise: number | string
  updated_at: string
  groups: GroupEmbed | GroupEmbed[] | null
}

const FLAG_EXPENSE = "expenses(group_id, created_by, payer_id, description, amount_paise, updated_at, groups(name))"

/**
 * Every open dispute the viewer can see, with its history. Falls back to the
 * pre-dispute-flow columns until 20261118180000_dispute_flow.sql is applied.
 */
const listOpenFlags = cache(async (): Promise<OpenFlag[]> => {
  const supabase = await client()
  let rows: Record<string, unknown>[] | null
  const full = await supabase
    .from("expense_flags")
    .select(`id, expense_id, user_id, reason, created_at, awaiting, expense_flag_events(id, kind, actor_id, note, created_at), ${FLAG_EXPENSE}`)
    .is("resolved_at", null)
  if (full.error) {
    const basic = await supabase
      .from("expense_flags")
      .select(`id, expense_id, user_id, reason, created_at, ${FLAG_EXPENSE}`)
      .is("resolved_at", null)
    fail(basic.error)
    rows = basic.data
  } else {
    rows = full.data
  }
  return (rows ?? []).flatMap((row) => {
    const expense = asOne(row.expenses as FlagExpenseEmbed | FlagExpenseEmbed[] | null)
    if (!expense) return []
    const group = asOne(expense.groups)
    const rawEvents = (row.expense_flag_events ?? []) as {
      id: string
      kind: DisputeEvent["kind"]
      actor_id: string
      note: string | null
      created_at: string
    }[]
    const events: DisputeEvent[] = rawEvents.length
      ? rawEvents
          .map((event) => ({
            id: event.id,
            kind: event.kind,
            actorId: event.actor_id,
            note: event.note,
            createdAt: event.created_at,
          }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      : [
          {
            id: `${row.id}-flagged`,
            kind: "flagged",
            actorId: row.user_id as string,
            note: (row.reason as string | null) ?? null,
            createdAt: row.created_at as string,
          },
        ]
    const flag: ExpenseFlag = {
      id: row.id as string,
      userId: row.user_id as string,
      reason: (row.reason as string | null) ?? null,
      createdAt: row.created_at as string,
      awaiting: row.awaiting === "flagger" ? "flagger" : "owner",
      events,
    }
    return [
      {
        flag,
        expenseId: row.expense_id as string,
        groupId: expense.group_id,
        groupName: group?.name ?? "Group",
        description: expense.description,
        amountPaise: num(expense.amount_paise),
        createdBy: expense.created_by,
        payerId: expense.payer_id,
        updatedAt: expense.updated_at,
      },
    ]
  })
})

async function openFlag(flagId: string) {
  const found = (await listOpenFlags()).find((item) => item.flag.id === flagId)
  if (!found) throw new AppError("That dispute is already resolved")
  return found
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

type ProfileEmbed = { id: string; display_name: string; email: string }
type GroupEmbed = { id: string; name: string }

// One Supabase client per request. Creating it reads the cookie store, so reuse it.
const client = cache(async () => createClient())

/**
 * Reads the signed-in user from the verified JWT claims instead of calling the
 * Auth server on every render. With asymmetric signing keys this needs no network
 * round trip; with legacy keys supabase-js falls back to getUser() itself.
 */
const currentAuthUser = cache(async (): Promise<{ id: string; email: string } | null> => {
  const supabase = await client()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" }
})

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await client()
  const authUser = await currentAuthUser()
  if (!authUser) return null
  const data = { user: authUser }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, email, is_admin, disabled, invited")
    .eq("id", data.user.id)
    .maybeSingle()
  const access = profile
    ? {
        id: profile.id as string,
        isAdmin: Boolean(profile.is_admin),
        disabled: Boolean(profile.disabled),
        invited: Boolean(profile.invited),
      }
    : null
  if (signInBlockReason(access)) {
    await supabase.auth.signOut()
    return null
  }
  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    displayName: profile?.display_name ?? "You",
    demo: false,
    isAdmin: Boolean(profile?.is_admin),
  }
})

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const supabase = await client()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error || !data.user) throw new AppError("Email or password is incorrect")
  // signInWithPassword already returns the user, so one profile read is enough.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, email, is_admin, disabled, invited")
    .eq("id", data.user.id)
    .maybeSingle()
  const reason = signInBlockReason(
    profile
      ? {
          id: profile.id as string,
          isAdmin: Boolean(profile.is_admin),
          disabled: Boolean(profile.disabled),
          invited: Boolean(profile.invited),
        }
      : null,
  )
  if (reason) {
    await supabase.auth.signOut()
    throw new AppError(reason)
  }
  return {
    id: data.user.id,
    email: (profile?.email as string | undefined) ?? data.user.email ?? "",
    displayName: (profile?.display_name as string | undefined) ?? "You",
    demo: false,
    isAdmin: Boolean(profile?.is_admin),
  }
}

export async function register(): Promise<SessionUser> {
  throw new AppError("Access is by invite only")
}

export async function signOut() {
  const supabase = await client()
  const { error } = await supabase.auth.signOut()
  fail(error)
}

export async function requestPasswordReset(email: string) {
  const supabase = await client()
  const redirectTo = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "http://localhost:3847"}/reset-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
  fail(error, "Could not send a reset email")
}

export async function updatePassword(password: string) {
  if (password.length < 8) throw new AppError("Use at least 8 characters")
  const supabase = await client()
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new AppError("Open the reset link from your email, then try again")
  const { error } = await supabase.auth.updateUser({ password })
  fail(error, "Could not update password")
}

export async function updateName(displayName: string): Promise<SessionUser> {
  const name = displayName.trim()
  if (name.length < 2 || name.length > 40) throw new AppError("Name must be 2–40 characters")
  const supabase = await client()
  const user = await getSessionUser()
  if (!user) throw new AppError("You need to sign in again")
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id)
  fail(error)
  return { ...user, displayName: name }
}

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new AppError("You need to sign in again")
  return user
}

export async function listGroups(): Promise<GroupCard[]> {
  const authUser = await currentAuthUser()
  if (!authUser) throw new AppError("You need to sign in again")
  const supabase = await client()
  const [
    user,
    { data: memberships, error },
    { data: pendingRows, error: pendingError },
    openFlags,
  ] = await Promise.all([
    requireUser(),
    supabase.from("group_members").select("group_id, user_id, role, groups(id, name), profiles(id, display_name, email)"),
    supabase.from("settlements").select("group_id").eq("to_user_id", authUser.id).eq("status", "pending"),
    listOpenFlags(),
  ])
  fail(error)
  fail(pendingError)
  const rows = memberships ?? []
  const groupIds = [...new Set(rows.map((row) => row.group_id as string))]

  const balanceResults = await Promise.all(
    groupIds.map(async (groupId) => {
      const { data: balances, error: balanceError } = await supabase.rpc("group_balances", {
        p_group_id: groupId,
      })
      fail(balanceError)
      return [groupId, (balances ?? []) as { user_id: string; net_paise: number | string }[]] as const
    }),
  )
  const balancesByGroup = new Map(balanceResults)

  const cards: GroupCard[] = groupIds.map((groupId) => {
    const balanceList = balancesByGroup.get(groupId) ?? []
    const mine = balanceList.find((balance) => balance.user_id === user.id)
    const members = rows
      .filter((row) => row.group_id === groupId)
      .map((row) => toMember(row))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
    const group = asOne(rows.find((row) => row.group_id === groupId)?.groups as GroupEmbed | GroupEmbed[])
    return {
      id: groupId,
      name: group?.name ?? "Group",
      members,
      myNetPaise: num(mine?.net_paise),
      pendingForMe: (pendingRows ?? []).filter((row) => row.group_id === groupId).length,
      disputedCount: new Set(openFlags.filter((item) => item.groupId === groupId).map((item) => item.expenseId)).size,
      disputesForMe: openFlags.filter((item) => item.groupId === groupId && disputeNeedsMe(item.flag, item, user.id)).length,
    }
  })
  return cards.sort((a, b) => a.name.localeCompare(b.name))
}

function toMember(row: {
  user_id: string
  role: string
  profiles: ProfileEmbed | ProfileEmbed[] | null
}): Member {
  const profile = asOne(row.profiles)
  return {
    id: row.user_id,
    displayName: profile?.display_name ?? "Someone",
    email: profile?.email ?? "",
    role: row.role === "admin" || row.role === "owner" ? "admin" : "member",
  }
}

export async function createGroup(name: string) {
  const supabase = await client()
  const { data, error } = await supabase.rpc("create_group", { p_name: name })
  fail(error)
  return data as string
}

export async function getGroup(groupId: string): Promise<GroupDetail | null> {
  const supabase = await client()
  // Everything is scoped by row-level security, so all reads can start at once.
  const [
    user,
    { data: group, error },
    { data: memberRows, error: memberError },
    { data: expenseRows, error: expenseError },
    openFlags,
    { data: settlementRows, error: settlementError },
    { data: balanceRows, error: balanceError },
    { data: debtRows, error: debtError },
  ] = await Promise.all([
    requireUser(),
    supabase.from("groups").select("id, name, created_by").eq("id", groupId).maybeSingle(),
    supabase.from("group_members").select("user_id, role, profiles(id, display_name, email)").eq("group_id", groupId),
    supabase
      .from("expenses")
      .select(
        "id, group_id, description, amount_paise, payer_id, expense_date, category, created_by, created_at, updated_at, expense_shares(user_id, share_paise)",
      )
      .eq("group_id", groupId),
    listOpenFlags(),
    supabase.from("settlements").select("*").eq("group_id", groupId).order("created_at", { ascending: false }),
    supabase.rpc("group_balances", { p_group_id: groupId }),
    supabase.rpc("simplified_debts", { p_group_id: groupId }),
  ])
  fail(error)
  if (!group) return null
  fail(memberError)
  fail(expenseError)
  fail(settlementError)
  fail(balanceError)
  fail(debtError)

  const settlements: Settlement[] = (settlementRows ?? []).map(toSettlement)
  const lockedThrough = lockDate(settlements as LedgerSettlement[])
  const lockTime = lockedAt(settlements as LedgerSettlement[])
  const expenses: Expense[] = (expenseRows ?? [])
    .map((row) => {
      const shares = (row.expense_shares ?? [])
        .map((share) => ({
          userId: share.user_id as string,
          sharePaise: num(share.share_paise),
        }))
        .filter((share) => share.sharePaise > 0)
      const expenseDate = String(row.expense_date)
      const flags = openFlags.filter((item) => item.expenseId === row.id).map((item) => item.flag)
      return {
        id: row.id as string,
        groupId: row.group_id as string,
        description: row.description as string,
        amountPaise: num(row.amount_paise),
        payerId: row.payer_id as string,
        expenseDate,
        category: (row.category as string | null) ?? null,
        createdBy: row.created_by as string,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        shares,
        locked: isExpenseLocked(expenseDate, lockedThrough, row.created_at as string, lockTime),
        disputed: flags.length > 0,
        flags,
      }
    })
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt))

  const balances: Balance[] = ((balanceRows ?? []) as {
    user_id: string
    paid_paise: number | string
    owed_paise: number | string
    settlements_paid_paise: number | string
    settlements_received_paise: number | string
    net_paise: number | string
  }[]).map((row) => ({
    userId: row.user_id,
    paidPaise: num(row.paid_paise),
    owedPaise: num(row.owed_paise),
    settlementsPaidPaise: num(row.settlements_paid_paise),
    settlementsReceivedPaise: num(row.settlements_received_paise),
    netPaise: num(row.net_paise),
  }))
  const debts: Debt[] = ((debtRows ?? []) as {
    from_user_id: string
    to_user_id: string
    amount_paise: number | string
  }[]).map((row) => ({
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amountPaise: num(row.amount_paise),
  }))

  return {
    id: group.id,
    name: group.name,
    createdBy: group.created_by,
    members: (memberRows ?? [])
      .map((row) => toMember(row as Parameters<typeof toMember>[0]))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    expenses,
    balances,
    debts,
    settlements,
    myNetPaise: balances.find((balance) => balance.userId === user.id)?.netPaise ?? 0,
    lockDate: lockedThrough,
    myRole: (memberRows ?? []).some(
      (row) => row.user_id === user.id && (row.role === "admin" || row.role === "owner"),
    )
      ? "admin"
      : "member",
  }
}

async function rpcVoid(name: string, args: Record<string, unknown>) {
  const supabase = await client()
  const { error } = await supabase.rpc(name, args)
  fail(error)
}

export async function renameGroup(groupId: string, name: string) {
  await rpcVoid("rename_group", { p_group_id: groupId, p_name: name })
}

export async function deleteGroup(groupId: string) {
  await rpcVoid("delete_group", { p_group_id: groupId })
}

export async function removeMember(groupId: string, userId: string) {
  await rpcVoid("remove_group_member", { p_group_id: groupId, p_user_id: userId })
}

export async function promoteMember(groupId: string, userId: string) {
  await rpcVoid("promote_group_member", { p_group_id: groupId, p_user_id: userId })
}

export async function revokeInvites(groupId: string) {
  await rpcVoid("revoke_invites", { p_group_id: groupId })
}

export async function regenerateInvite(groupId: string) {
  const supabase = await client()
  const { data, error } = await supabase.rpc("regenerate_invite", { p_group_id: groupId })
  fail(error)
  const payload = data as { code: string; expires_at: string }
  return { code: payload.code, expiresAt: payload.expires_at }
}

function toSettlement(row: {
  id: string
  group_id: string
  from_user_id: string
  to_user_id: string
  amount_paise: number | string
  up_to_date: string
  status: string
  created_by: string
  created_at: string
  resolved_at: string | null
}): Settlement {
  return {
    id: row.id,
    groupId: row.group_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amountPaise: num(row.amount_paise),
    upToDate: row.up_to_date,
    status: row.status as SettlementStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }
}

export async function createInvite(groupId: string) {
  const supabase = await client()
  const { data, error } = await supabase.rpc("create_invite", { p_group_id: groupId })
  fail(error)
  const payload = data as { code: string; expires_at: string }
  return { code: payload.code, expiresAt: payload.expires_at }
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const supabase = await client()
  const { data, error } = await supabase.rpc("preview_invite", { p_code: code })
  fail(error)
  const payload = data as {
    valid: boolean
    reason: InvitePreview["reason"] | null
    group_id?: string
    group_name?: string
    expires_at?: string
    member_count?: number
  }
  return {
    valid: payload.valid,
    reason: payload.reason ?? undefined,
    groupId: payload.group_id,
    groupName: payload.group_name,
    expiresAt: payload.expires_at,
    memberCount: payload.member_count,
  }
}

export async function joinByCode(code: string) {
  const user = await requireUser()
  const before = await previewInvite(code)
  const supabase = await client()
  const { data, error } = await supabase.rpc("join_group_by_code", { p_code: code })
  fail(error)
  return {
    groupId: data as string,
    alreadyMember: before.reason === "already_member" && before.groupId === data && user.id.length > 0,
  }
}

/** The expense as stored now, with its shares. Cached per request so a check and a diff share one query. */
export const expenseSnapshot = cache(async (expenseId: string): Promise<ExpenseSnapshot | null> => {
  const supabase = await client()
  const { data, error } = await supabase
    .from("expenses")
    .select("id, group_id, description, amount_paise, payer_id, expense_date, category, created_by, expense_shares(user_id, share_paise)")
    .eq("id", expenseId)
    .maybeSingle()
  fail(error)
  if (!data) return null
  return {
    id: data.id as string,
    groupId: data.group_id as string,
    description: data.description as string,
    amountPaise: num(data.amount_paise as number | string),
    payerId: data.payer_id as string,
    expenseDate: data.expense_date as string,
    category: (data.category as string | null) ?? null,
    createdBy: data.created_by as string,
    shares: ((data.expense_shares ?? []) as { user_id: string; share_paise: number | string }[]).map((row) => ({
      userId: row.user_id,
      sharePaise: num(row.share_paise),
    })),
  }
})

/** Throws unless the signed-in user added this expense. The database trigger enforces it too. */
async function assertExpenseCreator(expenseId: string) {
  const [user, snapshot] = await Promise.all([requireUser(), expenseSnapshot(expenseId)])
  if (!snapshot) throw new AppError("Expense not found")
  if (!canModifyExpense(snapshot, user.id)) throw new AppError(ONLY_CREATOR_MESSAGE)
}

export async function saveExpense(input: SaveExpenseInput) {
  if (input.category && !isCategory(input.category)) throw new AppError("Unknown category")
  if (input.id) await assertExpenseCreator(input.id)
  const supabase = await client()
  const { data, error } = await supabase.rpc("save_expense", {
    p_id: input.id ?? null,
    p_group_id: input.groupId,
    p_description: input.description,
    p_amount_paise: input.amountPaise,
    p_payer_id: input.payerId,
    p_expense_date: input.expenseDate,
    p_category: input.category,
    p_shares: input.shares.map((share) => ({
      user_id: share.userId,
      share_paise: share.sharePaise,
    })),
  })
  fail(error)
  return data as string
}

export async function deleteExpense(expenseId: string) {
  await assertExpenseCreator(expenseId)
  const supabase = await client()
  const { error } = await supabase.rpc("delete_expense", { p_id: expenseId })
  fail(error)
}

export async function flagExpense(expenseId: string, reason: string) {
  const [user, snapshot] = await Promise.all([requireUser(), expenseSnapshot(expenseId)])
  if (!snapshot) throw new AppError("Expense not found")
  const blocked = flagBlockReason({
    sharePaise: snapshot.shares.find((share) => share.userId === user.id)?.sharePaise ?? 0,
    actorId: user.id,
    creatorId: snapshot.createdBy,
  })
  if (blocked) throw new AppError(blocked)
  const supabase = await client()
  const { data, error } = await supabase.rpc("flag_expense", { p_expense_id: expenseId, p_reason: reason })
  fail(error)
  return { flagId: data as string, snapshot }
}

export async function resolveFlag(flagId: string) {
  const [user, item] = await Promise.all([requireUser(), openFlag(flagId)])
  const blocked = resolveFlagBlockReason({ actorId: user.id, flaggerId: item.flag.userId })
  if (blocked) throw new AppError(blocked)
  const supabase = await client()
  const { error } = await supabase.rpc("resolve_expense_flag", { p_flag_id: flagId })
  fail(error)
  return item
}

/** The creator (or payer) has fixed things and asks the flagger to resolve. */
export async function requestResolve(flagId: string, note: string) {
  const [user, item] = await Promise.all([requireUser(), openFlag(flagId)])
  const blocked = requestResolveBlockReason({
    actorId: user.id,
    creatorId: item.createdBy,
    payerId: item.payerId,
    awaiting: item.flag.awaiting,
  })
  if (blocked) throw new AppError(blocked)
  const supabase = await client()
  const { error } = await supabase.rpc("request_flag_resolution", { p_flag_id: flagId, p_note: note })
  fail(error)
  return item
}

/** The flagger was asked to resolve but it's still wrong: back to the creator. */
export async function stillWrong(flagId: string, note: string) {
  const [user, item] = await Promise.all([requireUser(), openFlag(flagId)])
  const blocked = stillWrongBlockReason({ actorId: user.id, flaggerId: item.flag.userId, awaiting: item.flag.awaiting })
  if (blocked) throw new AppError(blocked)
  const supabase = await client()
  const { error } = await supabase.rpc("reject_flag_resolution", { p_flag_id: flagId, p_note: note })
  fail(error)
  return item
}

export async function markNoticeSeen(noticeId: string) {
  const supabase = await client()
  const { error } = await supabase.rpc("mark_notice_seen", { p_notice_id: noticeId })
  fail(error)
}

/**
 * Marks the given notices (or every unseen one when ids is null) as seen.
 * Uses one RPC call; if the 20261118120000 migration has not been applied yet,
 * falls back to the older one-notice-at-a-time RPC.
 */
export async function markNoticesSeen(noticeIds: string[] | null) {
  const supabase = await client()
  const { error } = await supabase.rpc("mark_notices_seen", { p_notice_ids: noticeIds })
  if (!error) return
  const missing = error.code === "PGRST202" || /mark_notices_seen/.test(error.message)
  if (!missing) fail(error)
  let ids = noticeIds
  if (!ids) {
    const user = await currentAuthUser()
    const { data, error: listError } = await supabase
      .from("share_notices")
      .select("id")
      .eq("user_id", user?.id ?? "")
      .is("seen_at", null)
    fail(listError)
    ids = (data ?? []).map((row) => row.id as string)
  }
  const results = await Promise.all(ids.map((id) => supabase.rpc("mark_notice_seen", { p_notice_id: id })))
  fail(results.find((result) => result.error)?.error ?? null)
}

export async function suggestSettlement(groupId: string, otherUserId: string, upToDate: string) {
  const supabase = await client()
  const { data, error } = await supabase.rpc("pairwise_i_owe", {
    p_group_id: groupId,
    p_other: otherUserId,
    p_up_to: upToDate,
  })
  fail(error)
  return num(data as number | string)
}

export async function requestSettlement(input: {
  groupId: string
  toUserId: string
  amountPaise: number
  upToDate: string
}) {
  const supabase = await client()
  const { data, error } = await supabase.rpc("request_settlement", {
    p_group_id: input.groupId,
    p_to: input.toUserId,
    p_amount: input.amountPaise,
    p_up_to: input.upToDate,
  })
  fail(error)
  return data as string
}

export async function resolveSettlement(settlementId: string, approve: boolean) {
  const supabase = await client()
  const { error } = await supabase.rpc("resolve_settlement", {
    p_id: settlementId,
    p_approve: approve,
  })
  fail(error)
}

export async function cancelSettlement(settlementId: string) {
  const supabase = await client()
  const { error } = await supabase.rpc("cancel_settlement", { p_id: settlementId })
  fail(error)
}

export async function listMyExpenses(): Promise<SummaryExpenseRow[]> {
  const supabase = await client()
  const { data, error } = await supabase
    .from("expenses")
    .select("id, group_id, description, amount_paise, payer_id, expense_date, category, expense_shares(user_id, share_paise)")
  fail(error)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    groupId: row.group_id as string,
    description: row.description as string,
    amountPaise: num(row.amount_paise),
    payerId: row.payer_id as string,
    expenseDate: String(row.expense_date),
    category: (row.category as string | null) ?? null,
    shares: ((row.expense_shares ?? []) as { user_id: string; share_paise: number | string }[])
      .map((share) => ({ userId: share.user_id, sharePaise: num(share.share_paise) }))
      .filter((share) => share.sharePaise > 0),
  }))
}

/** Cheap count for the nav badge, so the layout does not load the whole activity feed. */
export async function countUnseenNotices(): Promise<number> {
  const user = await currentAuthUser()
  if (!user) return 0
  const supabase = await client()
  const unseen = () =>
    supabase.from("share_notices").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("seen_at", null)
  // Dispute steps show up under Needs you instead, so they are not counted again here.
  const filtered = await unseen().not("kind", "in", `(${TASK_NOTICE_KINDS.join(",")})`)
  if (!filtered.error) return filtered.count ?? 0
  const { count, error } = await unseen()
  if (error) return 0
  return count ?? 0
}

/** The caller's notices. Falls back to the original columns until the change-notice migration is applied. */
async function listNotices(
  userId: string,
): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> {
  const supabase = await client()
  const result = await supabase
    .from("share_notices")
    .select("id, kind, summary, description, expense_id, group_id, actor_id, share_paise, created_at, seen_at, expenses(description), groups(name)")
    .eq("user_id", userId)
  if (!result.error || !/kind|summary|description/.test(result.error.message)) return result
  return await supabase
    .from("share_notices")
    .select("id, expense_id, group_id, actor_id, share_paise, created_at, seen_at, expenses(description), groups(name)")
    .eq("user_id", userId)
}

export async function getActivity() {
  const user = await requireUser()
  const openFlagsPromise = listOpenFlags()
  const supabase = await client()
  const [
    { data: expenseRows, error },
    { data: settlementRows, error: settlementError },
    { data: profiles, error: profileError },
    { data: noticeRows, error: noticeError },
  ] = await Promise.all([
    supabase.from("expenses").select("id, group_id, description, amount_paise, payer_id, created_at, groups(name)"),
    supabase.from("settlements").select("*, groups(name)"),
    supabase.from("profiles").select("id, display_name"),
    listNotices(user.id),
  ])
  const openFlags = await openFlagsPromise
  fail(error)
  fail(settlementError)
  fail(profileError)
  fail(noticeError)
  const nameOf = (id: string) => profiles?.find((profile) => profile.id === id)?.display_name ?? "Someone"

  const feed: ActivityItem[] = []
  for (const row of expenseRows ?? []) {
    const group = asOne(row.groups as GroupEmbed | GroupEmbed[] | null)
    const payer = nameOf(row.payer_id as string)
    feed.push({
      id: row.id as string,
      kind: "expense",
      groupId: row.group_id as string,
      groupName: group?.name ?? "Group",
      createdAt: row.created_at as string,
      actorId: row.payer_id as string,
      actorName: payer,
      title: row.description as string,
      subtitle: `${payer} paid · ${group?.name ?? "Group"}`,
      amountPaise: num(row.amount_paise),
    })
  }
  for (const row of settlementRows ?? []) {
    const settlement = toSettlement(row)
    const group = asOne(row.groups as GroupEmbed | GroupEmbed[] | null)
    const incoming = settlement.toUserId === user.id
    const outgoing = settlement.fromUserId === user.id
    feed.push({
      id: settlement.id,
      kind: "settlement",
      groupId: settlement.groupId,
      groupName: group?.name ?? "Group",
      createdAt: settlement.createdAt,
      actorId: settlement.fromUserId,
      actorName: nameOf(settlement.fromUserId),
      title:
        settlement.status === "pending"
          ? `${nameOf(settlement.fromUserId)} recorded a payment`
          : settlement.status === "approved"
            ? "Payment confirmed"
            : "Payment declined",
      subtitle: `${nameOf(settlement.fromUserId)} to ${nameOf(settlement.toUserId)} · ${group?.name ?? "Group"}`,
      amountPaise: settlement.amountPaise,
      status: settlement.status,
      settlementId: settlement.id,
      direction: incoming ? "incoming" : outgoing ? "outgoing" : "other",
    })
  }
  feed.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const pending = feed.filter(
    (item) => item.kind === "settlement" && item.status === "pending" && item.direction === "incoming",
  )
  const notices = (noticeRows ?? [])
    .map((row) => {
      const group = asOne(row.groups as GroupEmbed | GroupEmbed[] | null)
      const expense = asOne(row.expenses as { description?: string } | { description?: string }[] | null)
      const kind = (row.kind as ShareNotice["kind"] | undefined) ?? "added"
      return {
        id: row.id as string,
        kind,
        summary: (row.summary as string | null | undefined) ?? null,
        expenseId: (row.expense_id as string | null) ?? null,
        groupId: row.group_id as string,
        groupName: group?.name ?? "Group",
        actorId: row.actor_id as string,
        actorName: nameOf(row.actor_id as string),
        description: expense?.description ?? (row.description as string | null | undefined) ?? "an expense",
        sharePaise: num(row.share_paise as number | string),
        createdAt: row.created_at as string,
        seen: Boolean(row.seen_at),
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    pending,
    disputes: disputeTasks(openFlags, user.id, nameOf),
    notices,
    feed: feed.filter((item) => !pending.some((itemPending) => itemPending.id === item.id)),
  }
}

/** The caller's UPI ID. Null when unset, or when the UPI migration has not been applied yet. */
export async function getMyUpiId(): Promise<string | null> {
  const user = await currentAuthUser()
  if (!user) return null
  const supabase = await client()
  const { data, error } = await supabase.from("profiles").select("upi_id").eq("id", user.id).maybeSingle()
  if (error) return null
  return (data?.upi_id as string | null | undefined) ?? null
}

export async function updateUpi(upiId: string | null): Promise<string | null> {
  const value = normalizeUpi(upiId)
  if (value && !isValidUpi(value)) throw new AppError("That doesn't look like a valid UPI ID (name@bank)")
  const user = await requireUser()
  const supabase = await client()
  const { error } = await supabase.from("profiles").update({ upi_id: value }).eq("id", user.id)
  if (error && (error.code === "42703" || /upi_id/.test(error.message))) {
    throw new AppError("UPI IDs need a database update first. Ask the admin to run the latest migration.")
  }
  fail(error)
  return value
}

/**
 * UPI IDs of everyone the caller can see (row-level security limits this to people they
 * share a group with). Needs no group lookup first, so it runs in parallel with one.
 * Never throws: UPI is optional.
 */
export async function getUpiIds(): Promise<Record<string, string>> {
  const supabase = await client()
  const { data, error } = await supabase.from("profiles").select("id, upi_id").not("upi_id", "is", null)
  if (error) return {}
  const out: Record<string, string> = {}
  for (const row of data ?? []) if (row.upi_id) out[row.id as string] = row.upi_id as string
  return out
}

export async function savePushSubscription(input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string }) {
  await requireUser()
  const supabase = await client()
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: input.endpoint,
    p_keys: input.keys,
    p_user_agent: input.userAgent,
  })
  if (error && (error.code === "PGRST202" || /save_push_subscription/.test(error.message))) {
    throw new AppError("Notifications need a database update first. Ask the admin to run the latest migration.")
  }
  fail(error)
}

export async function deletePushSubscription(endpoint: string) {
  const user = await requireUser()
  const supabase = await client()
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id)
  if (error && error.code !== "42P01") fail(error)
}
