import "server-only"

import { cache } from "react"

import { signInBlockReason } from "@/lib/admin"
import { isCategory } from "@/lib/categories"
import { AppError } from "@/lib/errors"
import { isExpenseLocked, lockDate, type LedgerSettlement } from "@/lib/ledger"
import { monthStartISO } from "@/lib/money"
import { createClient } from "@/lib/supabase/server"
import type {
  ActivityItem,
  Balance,
  Debt,
  Expense,
  GroupCard,
  GroupDetail,
  GroupSummary,
  InvitePreview,
  Member,
  SaveExpenseInput,
  SessionUser,
  Settlement,
  SettlementStatus,
} from "@/lib/types"

function fail(error: { message: string } | null, fallback?: string): asserts error is null {
  if (error) throw new AppError(fallback ?? error.message)
}

function num(value: number | string | null | undefined) {
  if (value === null || value === undefined) return 0
  return typeof value === "number" ? value : Number(value)
}

function embeddedGroupId(value: { group_id?: string } | { group_id?: string }[] | null): string | null {
  const row = asOne(value)
  return row?.group_id ?? null
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
    { data: openFlags, error: flagError },
  ] = await Promise.all([
    requireUser(),
    supabase.from("group_members").select("group_id, user_id, role, groups(id, name), profiles(id, display_name, email)"),
    supabase.from("settlements").select("group_id").eq("to_user_id", authUser.id).eq("status", "pending"),
    supabase.from("expense_flags").select("expense_id, expenses(group_id)").is("resolved_at", null),
  ])
  fail(error)
  fail(pendingError)
  fail(flagError)
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
      disputedCount: (openFlags ?? []).filter((row) => embeddedGroupId(row.expenses) === groupId).length,
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
    { data: flagRows, error: openFlagError },
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
    supabase.from("expense_flags").select("id, expense_id, user_id, reason, created_at").is("resolved_at", null),
    supabase.from("settlements").select("*").eq("group_id", groupId).order("created_at", { ascending: false }),
    supabase.rpc("group_balances", { p_group_id: groupId }),
    supabase.rpc("simplified_debts", { p_group_id: groupId }),
  ])
  fail(error)
  if (!group) return null
  fail(memberError)
  fail(expenseError)
  fail(openFlagError)
  fail(settlementError)
  fail(balanceError)
  fail(debtError)

  const settlements: Settlement[] = (settlementRows ?? []).map(toSettlement)
  const lockedThrough = lockDate(settlements as LedgerSettlement[])
  const expenses: Expense[] = (expenseRows ?? [])
    .map((row) => {
      const shares = (row.expense_shares ?? [])
        .map((share) => ({
          userId: share.user_id as string,
          sharePaise: num(share.share_paise),
        }))
        .filter((share) => share.sharePaise > 0)
      const expenseDate = String(row.expense_date)
      const flags = (flagRows ?? [])
        .filter((flag) => flag.expense_id === row.id)
        .map((flag) => ({
          id: flag.id as string,
          userId: flag.user_id as string,
          reason: (flag.reason as string | null) ?? null,
          createdAt: flag.created_at as string,
        }))
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
        locked: isExpenseLocked(expenseDate, lockedThrough),
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

export async function saveExpense(input: SaveExpenseInput) {
  if (input.category && !isCategory(input.category)) throw new AppError("Unknown category")
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
  const supabase = await client()
  const { error } = await supabase.rpc("delete_expense", { p_id: expenseId })
  fail(error)
}

export async function flagExpense(expenseId: string, reason: string) {
  const supabase = await client()
  const { error } = await supabase.rpc("flag_expense", { p_expense_id: expenseId, p_reason: reason })
  fail(error)
}

export async function resolveFlag(flagId: string) {
  const supabase = await client()
  const { error } = await supabase.rpc("resolve_expense_flag", { p_flag_id: flagId })
  fail(error)
}

export async function markNoticeSeen(noticeId: string) {
  const supabase = await client()
  const { error } = await supabase.rpc("mark_notice_seen", { p_notice_id: noticeId })
  fail(error)
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

export async function getSummary(groupId: string, monthStart: string): Promise<GroupSummary | null> {
  const supabase = await client()
  const selected = monthStartISO(monthStart)
  const [detail, { data: months, error }, { data: categories, error: categoryError }] = await Promise.all([
    getGroup(groupId),
    supabase.rpc("group_month_totals", { p_group_id: groupId }),
    supabase.rpc("group_category_totals", { p_group_id: groupId, p_month: selected }),
  ])
  if (!detail) return null
  fail(error)
  fail(categoryError)

  const monthRows = ((months ?? []) as {
    month_start: string
    total_paise: number | string
    my_share_paise: number | string
  }[]).map((row) => ({
    monthStart: String(row.month_start).slice(0, 10),
    totalPaise: num(row.total_paise),
    mySharePaise: num(row.my_share_paise),
    categories: [] as { category: string; totalPaise: number }[],
  }))
  if (!monthRows.some((month) => month.monthStart === selected)) {
    monthRows.push({ monthStart: selected, totalPaise: 0, mySharePaise: 0, categories: [] })
  }
  monthRows.sort((a, b) => b.monthStart.localeCompare(a.monthStart))
  const categoryRows = ((categories ?? []) as { category: string | null; total_paise: number | string }[]).map(
    (row) => ({
      category: row.category ?? "other",
      totalPaise: num(row.total_paise),
    }),
  )
  const current = monthRows.find((month) => month.monthStart === selected)!
  current.categories = categoryRows

  return {
    group: { id: detail.id, name: detail.name, members: detail.members },
    monthStart: selected,
    groupTotalPaise: current.totalPaise,
    mySharePaise: current.mySharePaise,
    myNetPaise: detail.myNetPaise,
    debts: detail.debts,
    months: monthRows,
  }
}

/** Cheap count for the nav badge, so the layout does not load the whole activity feed. */
export async function countUnseenNotices(): Promise<number> {
  const user = await currentAuthUser()
  if (!user) return 0
  const supabase = await client()
  const { count, error } = await supabase
    .from("share_notices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("seen_at", null)
  if (error) return 0
  return count ?? 0
}

export async function getActivity() {
  const user = await requireUser()
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
    supabase
      .from("share_notices")
      .select("id, expense_id, group_id, actor_id, share_paise, created_at, seen_at, expenses(description), groups(name)")
      .eq("user_id", user.id),
  ])
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
      return {
        id: row.id as string,
        expenseId: row.expense_id as string,
        groupId: row.group_id as string,
        groupName: group?.name ?? "Group",
        actorId: row.actor_id as string,
        actorName: nameOf(row.actor_id as string),
        description: expense?.description ?? "an expense",
        sharePaise: num(row.share_paise),
        createdAt: row.created_at as string,
        seen: Boolean(row.seen_at),
      }
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    pending,
    notices,
    feed: feed.filter((item) => !pending.some((itemPending) => itemPending.id === item.id)),
  }
}
