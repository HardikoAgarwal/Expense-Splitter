"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { errorMessage } from "@/lib/errors"
import { notifyExpenseAdded, notifySettlementRequested, notifySettlementResolved, pushEnabled } from "@/lib/push"
import * as queries from "@/lib/queries"
import type { ActionResult, SaveExpenseInput } from "@/lib/types"

function refresh() {
  revalidatePath("/", "layout")
}

/** Runs a push after the response has been sent, so it never slows the action down. */
function notifyLater(task: () => Promise<void>) {
  if (!pushEnabled()) return
  after(async () => {
    try {
      await task()
    } catch (error) {
      console.warn("[push] notify failed", error)
    }
  })
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    refresh()
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

export async function signInAction(email: string, password: string) {
  return run(() => queries.signIn(email, password))
}

export async function signUpAction() {
  return { ok: false as const, error: "Access is by invite only" }
}

export async function createAccountAction(input: { email: string; displayName: string }) {
  return run(() => queries.createAccount(input))
}

export async function setUserDisabledAction(userId: string, disabled: boolean) {
  return run(() => queries.setUserDisabled(userId, disabled))
}

export async function removeUserAction(userId: string) {
  return run(() => queries.removeUser(userId))
}

export async function redeemWelcomeAction(token: string, password: string) {
  return run(() => queries.redeemWelcome(token, password))
}

export async function signOutAction() {
  return run(() => queries.signOut())
}

export async function updateNameAction(displayName: string) {
  return run(() => queries.updateName(displayName))
}

export async function requestPasswordResetAction(email: string) {
  try {
    await queries.requestPasswordReset(email)
    return { ok: true as const, data: undefined }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function updatePasswordAction(password: string) {
  return run(() => queries.updatePassword(password))
}

export async function createGroupAction(name: string) {
  return run(() => queries.createGroup(name))
}

export async function createInviteAction(groupId: string) {
  return run(() => queries.createInvite(groupId))
}

export async function regenerateInviteAction(groupId: string) {
  return run(() => queries.regenerateInvite(groupId))
}

export async function revokeInvitesAction(groupId: string) {
  return run(() => queries.revokeInvites(groupId))
}

export async function renameGroupAction(groupId: string, name: string) {
  return run(() => queries.renameGroup(groupId, name))
}

export async function deleteGroupAction(groupId: string) {
  return run(() => queries.deleteGroup(groupId))
}

export async function removeMemberAction(groupId: string, userId: string) {
  return run(() => queries.removeMember(groupId, userId))
}

export async function promoteMemberAction(groupId: string, userId: string) {
  return run(() => queries.promoteMember(groupId, userId))
}

export async function joinGroupAction(code: string) {
  return run(() => queries.joinByCode(code))
}

export async function saveExpenseAction(input: SaveExpenseInput) {
  const result = await run(() => queries.saveExpense(input))
  if (result.ok && !input.id) {
    const user = await queries.getSessionUser()
    if (user) notifyLater(() => notifyExpenseAdded(user, input, result.data))
  }
  return result
}

export async function deleteExpenseAction(expenseId: string) {
  return run(() => queries.deleteExpense(expenseId))
}

export async function flagExpenseAction(expenseId: string, reason: string) {
  return run(() => queries.flagExpense(expenseId, reason))
}

export async function resolveFlagAction(flagId: string) {
  return run(() => queries.resolveFlag(flagId))
}

export async function markNoticeSeenAction(noticeId: string) {
  return run(() => queries.markNoticeSeen(noticeId))
}

/** Pass null to mark every unseen notice. */
export async function markNoticesSeenAction(noticeIds: string[] | null) {
  return run(() => queries.markNoticesSeen(noticeIds))
}

export async function suggestSettlementAction(groupId: string, otherUserId: string, upToDate: string) {
  try {
    const data = await queries.suggestSettlement(groupId, otherUserId, upToDate)
    return { ok: true as const, data }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function requestSettlementAction(input: {
  groupId: string
  toUserId: string
  amountPaise: number
  upToDate: string
}) {
  const result = await run(() => queries.requestSettlement(input))
  if (result.ok) {
    const user = await queries.getSessionUser()
    if (user) notifyLater(() => notifySettlementRequested(user, input, result.data))
  }
  return result
}

export async function resolveSettlementAction(settlementId: string, approve: boolean) {
  const result = await run(() => queries.resolveSettlement(settlementId, approve))
  if (result.ok) {
    const user = await queries.getSessionUser()
    if (user) notifyLater(() => notifySettlementResolved(user, settlementId, approve))
  }
  return result
}

export async function updateUpiAction(upiId: string | null) {
  return run(() => queries.updateUpi(upiId))
}

export async function savePushSubscriptionAction(input: {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent: string
}) {
  try {
    await queries.savePushSubscription(input)
    return { ok: true as const, data: undefined }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function deletePushSubscriptionAction(endpoint: string) {
  try {
    await queries.deletePushSubscription(endpoint)
    return { ok: true as const, data: undefined }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}

export async function cancelSettlementAction(settlementId: string) {
  return run(() => queries.cancelSettlement(settlementId))
}

export async function loadGroupAction(groupId: string) {
  try {
    const data = await queries.getGroup(groupId)
    if (!data) return { ok: false as const, error: "That group is not available" }
    return { ok: true as const, data }
  } catch (error) {
    return { ok: false as const, error: errorMessage(error) }
  }
}
