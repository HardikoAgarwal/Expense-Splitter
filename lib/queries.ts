import "server-only"

import { cache } from "react"

import * as demo from "@/lib/demo/db"
import { isTaskNotice, type OpenFlag } from "@/lib/disputes"
import { isDemoMode } from "@/lib/env"
import { clearDemoUserId, readDemoUserId, writeDemoUserId } from "@/lib/session"
import * as accounts from "@/lib/supabase/accounts"
import * as remote from "@/lib/supabase/store"
import type { SaveExpenseInput } from "@/lib/types"

export const getSessionUser = cache(async () => {
  if (!isDemoMode()) return remote.getSessionUser()
  const userId = await readDemoUserId()
  if (!userId) return null
  return demo.getUser(userId)
})

async function actor() {
  const user = await getSessionUser()
  if (!user) return null
  return user
}

export async function signIn(email: string, password: string) {
  if (!isDemoMode()) return remote.signIn(email, password)
  const user = await demo.authenticate(email, password)
  await writeDemoUserId(user.id)
  return user
}

export async function register() {
  throw new Error("Access is by invite only")
}

async function actorOrThrow() {
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return user
}

export async function listAppUsers() {
  const user = await actorOrThrow()
  if (isDemoMode()) return demo.listAppUsers(user.id)
  return accounts.listAppUsers(user)
}

export async function createAccount(input: { email: string; displayName: string }) {
  const user = await actorOrThrow()
  if (isDemoMode()) return demo.createAccount(user.id, input)
  return accounts.createAccount(user, input)
}

export async function createSignupLink() {
  const user = await actorOrThrow()
  if (isDemoMode()) return demo.createSignupLink(user.id)
  return accounts.createSignupLink(user)
}

export async function previewSignupLink(token: string) {
  if (isDemoMode()) return demo.previewSignupLink(token)
  return accounts.previewSignupLink(token)
}

/** Creates the account from a link, then signs the new person in. */
export async function signUpWithLink(token: string, input: { name: string; email: string; password: string }) {
  const email = isDemoMode() ? await demo.redeemSignupLink(token, input) : await accounts.redeemSignupLink(token, input)
  return signIn(email, input.password)
}

/** Group invite for someone with no account: create it, sign them in, and add them to the group. */
export async function signUpForGroup(code: string, input: { name: string; email: string; password: string }) {
  const preview = await previewInvite(code)
  if (!preview.valid) {
    throw new Error(preview.reason === "expired" ? "This invite has expired" : "This invite is invalid")
  }
  const email = isDemoMode() ? await demo.createInvitedUser(input) : await accounts.createInvitedUser(input)
  const user = await signIn(email, input.password)
  const joined = await joinByCode(code)
  return { user, groupId: joined.groupId }
}

export async function setUserDisabled(userId: string, disabled: boolean) {
  const user = await actorOrThrow()
  if (isDemoMode()) return demo.setUserDisabled(user.id, userId, disabled)
  return accounts.setUserDisabled(user, userId, disabled)
}

export async function removeUser(userId: string) {
  const user = await actorOrThrow()
  if (isDemoMode()) return demo.removeUser(user.id, userId)
  return accounts.removeUser(user, userId)
}

export async function redeemWelcome(token: string, password: string) {
  if (isDemoMode()) return demo.redeemWelcome(token, password)
  return accounts.redeemWelcome(token, password)
}

export async function signOut() {
  if (!isDemoMode()) {
    await remote.signOut()
    return
  }
  await clearDemoUserId()
}

export async function updateName(displayName: string) {
  if (!isDemoMode()) return remote.updateName(displayName)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.updateName(user.id, displayName)
}

export async function requestPasswordReset(email: string) {
  if (!isDemoMode()) return remote.requestPasswordReset(email)
  return demo.requestPasswordReset(email)
}

export async function updatePassword(password: string) {
  if (!isDemoMode()) return remote.updatePassword(password)
  const user = await actorOrThrow()
  return demo.updatePassword(user.id, password)
}

export const listGroups = cache(async () => {
  if (!isDemoMode()) return remote.listGroups()
  const user = await actor()
  if (!user) return []
  return demo.listGroups(user.id)
})

export async function createGroup(name: string) {
  if (!isDemoMode()) return remote.createGroup(name)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.createGroup(user.id, name)
}

export const getGroup = cache(async (groupId: string) => {
  if (!isDemoMode()) return remote.getGroup(groupId)
  const user = await actor()
  if (!user) return null
  return demo.getGroup(user.id, groupId)
})

export async function createInvite(groupId: string) {
  if (!isDemoMode()) return remote.createInvite(groupId)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.createInvite(user.id, groupId)
}

export async function regenerateInvite(groupId: string) {
  if (!isDemoMode()) return remote.regenerateInvite(groupId)
  const user = await actorOrThrow()
  return demo.regenerateInvite(user.id, groupId)
}

export async function revokeInvites(groupId: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.revokeInvites(groupId)
  return demo.revokeInvites(user.id, groupId)
}

export async function renameGroup(groupId: string, name: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.renameGroup(groupId, name)
  return demo.renameGroup(user.id, groupId, name)
}

export async function deleteGroup(groupId: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.deleteGroup(groupId)
  return demo.deleteGroup(user.id, groupId)
}

export async function removeMember(groupId: string, userId: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.removeMember(groupId, userId)
  return demo.removeMember(user.id, groupId, userId)
}

export async function promoteMember(groupId: string, userId: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.promoteMember(groupId, userId)
  return demo.promoteMember(user.id, groupId, userId)
}

export async function previewInvite(code: string) {
  if (!isDemoMode()) return remote.previewInvite(code)
  const user = await actor()
  return demo.previewInvite(user?.id ?? null, code)
}

export async function joinByCode(code: string) {
  if (!isDemoMode()) return remote.joinByCode(code)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.joinByCode(user.id, code)
}

export async function saveExpense(input: SaveExpenseInput) {
  if (!isDemoMode()) return remote.saveExpense(input)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.saveExpense(user.id, input)
}

/** The stored expense before a change, for change notices. Demo mode records its own notices. */
export async function expenseSnapshot(expenseId: string) {
  if (isDemoMode()) return null
  try {
    return await remote.expenseSnapshot(expenseId)
  } catch {
    return null
  }
}

export async function deleteExpense(expenseId: string) {
  if (!isDemoMode()) return remote.deleteExpense(expenseId)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.deleteExpense(user.id, expenseId)
}

/** Who to push to after a dispute step. Null in demo mode, where push is off. */
export type DisputeContext = {
  expenseId: string
  groupId: string
  description: string
  createdBy: string
  payerId: string
  flaggerId: string
}

function contextOf(item: OpenFlag): DisputeContext {
  return {
    expenseId: item.expenseId,
    groupId: item.groupId,
    description: item.description,
    createdBy: item.createdBy,
    payerId: item.payerId,
    flaggerId: item.flag.userId,
  }
}

export async function flagExpense(expenseId: string, reason: string): Promise<DisputeContext | null> {
  const user = await actorOrThrow()
  if (isDemoMode()) {
    await demo.flagExpense(user.id, expenseId, reason)
    return null
  }
  const { snapshot } = await remote.flagExpense(expenseId, reason)
  return {
    expenseId,
    groupId: snapshot.groupId,
    description: snapshot.description,
    createdBy: snapshot.createdBy,
    payerId: snapshot.payerId,
    flaggerId: user.id,
  }
}

export async function resolveFlag(flagId: string): Promise<DisputeContext | null> {
  const user = await actorOrThrow()
  if (isDemoMode()) {
    await demo.resolveFlag(user.id, flagId)
    return null
  }
  return contextOf(await remote.resolveFlag(flagId))
}

export async function requestResolve(flagId: string, note: string): Promise<DisputeContext | null> {
  const user = await actorOrThrow()
  if (isDemoMode()) {
    await demo.requestResolve(user.id, flagId, note)
    return null
  }
  return contextOf(await remote.requestResolve(flagId, note))
}

export async function stillWrong(flagId: string, note: string): Promise<DisputeContext | null> {
  const user = await actorOrThrow()
  if (isDemoMode()) {
    await demo.stillWrong(user.id, flagId, note)
    return null
  }
  return contextOf(await remote.stillWrong(flagId, note))
}

export async function markNoticeSeen(noticeId: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.markNoticeSeen(noticeId)
  return demo.markNoticeSeen(user.id, noticeId)
}

export async function markNoticesSeen(noticeIds: string[] | null) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.markNoticesSeen(noticeIds)
  return demo.markNoticesSeen(user.id, noticeIds)
}

export async function suggestSettlement(groupId: string, otherUserId: string, upToDate: string) {
  if (!isDemoMode()) return remote.suggestSettlement(groupId, otherUserId, upToDate)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.suggestSettlement(user.id, groupId, otherUserId, upToDate)
}

export async function requestSettlement(input: {
  groupId: string
  toUserId: string
  amountPaise: number
  upToDate: string
}) {
  if (!isDemoMode()) return remote.requestSettlement(input)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.requestSettlement(user.id, input)
}

export async function resolveSettlement(settlementId: string, approve: boolean) {
  if (!isDemoMode()) return remote.resolveSettlement(settlementId, approve)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.resolveSettlement(user.id, settlementId, approve)
}

export async function cancelSettlement(settlementId: string) {
  if (!isDemoMode()) return remote.cancelSettlement(settlementId)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.cancelSettlement(user.id, settlementId)
}

export const listMyExpenses = cache(async () => {
  if (!isDemoMode()) return remote.listMyExpenses()
  const user = await actor()
  if (!user) return []
  const groups = await demo.listGroups(user.id)
  const details = await Promise.all(groups.map((group) => demo.getGroup(user.id, group.id)))
  return details.flatMap((detail) =>
    (detail?.expenses ?? []).map((expense) => ({
      id: expense.id,
      groupId: expense.groupId,
      description: expense.description,
      amountPaise: expense.amountPaise,
      payerId: expense.payerId,
      expenseDate: expense.expenseDate,
      category: expense.category,
      shares: expense.shares,
    })),
  )
})

export const countUnseenNotices = cache(async () => {
  if (!isDemoMode()) return remote.countUnseenNotices()
  const user = await actor()
  if (!user) return 0
  const activity = await demo.getActivity(user.id)
  return activity.notices.filter((notice) => !notice.seen && !isTaskNotice(notice.kind)).length
})

export const getActivity = cache(async () => {
  if (!isDemoMode()) return remote.getActivity()
  const user = await actor()
  if (!user) return { pending: [], disputes: [], notices: [], feed: [] }
  return demo.getActivity(user.id)
})

export async function pendingCount() {
  const activity = await getActivity()
  return activity.pending.length
}

export async function getMyUpiId() {
  if (!isDemoMode()) return remote.getMyUpiId()
  const user = await actor()
  if (!user) return null
  return demo.getUpiId(user.id)
}

export async function updateUpi(upiId: string | null) {
  if (!isDemoMode()) return remote.updateUpi(upiId)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.updateUpi(user.id, upiId)
}

export async function getUpiIds() {
  if (!isDemoMode()) return remote.getUpiIds()
  return demo.getUpiIds()
}

export async function savePushSubscription(input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string }) {
  if (isDemoMode()) throw new Error("Notifications are not available in demo mode")
  return remote.savePushSubscription(input)
}

export async function deletePushSubscription(endpoint: string) {
  if (isDemoMode()) return
  return remote.deletePushSubscription(endpoint)
}
