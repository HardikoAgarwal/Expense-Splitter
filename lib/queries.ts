import "server-only"

import { cache } from "react"

import * as demo from "@/lib/demo/db"
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

export async function deleteExpense(expenseId: string) {
  if (!isDemoMode()) return remote.deleteExpense(expenseId)
  const user = await actor()
  if (!user) throw new Error("You need to sign in again")
  return demo.deleteExpense(user.id, expenseId)
}

export async function flagExpense(expenseId: string, reason: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.flagExpense(expenseId, reason)
  return demo.flagExpense(user.id, expenseId, reason)
}

export async function resolveFlag(flagId: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.resolveFlag(flagId)
  return demo.resolveFlag(user.id, flagId)
}

export async function markNoticeSeen(noticeId: string) {
  const user = await actorOrThrow()
  if (!isDemoMode()) return remote.markNoticeSeen(noticeId)
  return demo.markNoticeSeen(user.id, noticeId)
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

export const countUnseenNotices = cache(async () => {
  if (!isDemoMode()) return remote.countUnseenNotices()
  const user = await actor()
  if (!user) return 0
  const activity = await demo.getActivity(user.id)
  return activity.notices.filter((notice) => !notice.seen).length
})

export const getActivity = cache(async () => {
  if (!isDemoMode()) return remote.getActivity()
  const user = await actor()
  if (!user) return { pending: [], notices: [], feed: [] }
  return demo.getActivity(user.id)
})

export async function getSummary(groupId: string, monthStart: string) {
  if (!isDemoMode()) return remote.getSummary(groupId, monthStart)
  const user = await actor()
  if (!user) return null
  return demo.getSummary(user.id, groupId, monthStart)
}

export async function pendingCount() {
  const activity = await getActivity()
  return activity.pending.length
}
