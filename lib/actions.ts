"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { errorMessage } from "@/lib/errors"
import {
  notifyExpenseAdded,
  notifyExpenseDeleted,
  notifyDispute,
  notifyExpenseEdited,
  notifySettlementRequested,
  notifySettlementResolved,
  serverNotificationsEnabled,
} from "@/lib/push"
import * as queries from "@/lib/queries"
import type { ActionResult, SaveExpenseInput } from "@/lib/types"

function refresh() {
  revalidatePath("/", "layout")
}

/** Runs notices and pushes after the response has been sent, so they never slow the action down. */
function notifyLater(task: () => Promise<void>) {
  if (!serverNotificationsEnabled()) return
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

export async function createSignupLinkAction() {
  return run(() => queries.createSignupLink())
}

export async function signUpWithLinkAction(token: string, input: { name: string; email: string; password: string }) {
  return run(() => queries.signUpWithLink(token, input))
}

export async function signUpForGroupAction(code: string, input: { name: string; email: string; password: string }) {
  return run(() => queries.signUpForGroup(code, input))
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

export async function removeMemberAction(groupId: string, userId: string, writeOff = false) {
  return run(() => queries.removeMember(groupId, userId, writeOff))
}

export async function leaveGroupAction(groupId: string) {
  return run(() => queries.leaveGroup(groupId))
}

export async function promoteMemberAction(groupId: string, userId: string) {
  return run(() => queries.promoteMember(groupId, userId))
}

export async function joinGroupAction(code: string) {
  return run(() => queries.joinByCode(code))
}

export async function saveExpenseAction(input: SaveExpenseInput) {
  // Read the stored version first so the people in the split can be told what changed.
  const before = input.id ? await queries.expenseSnapshot(input.id) : null
  const result = await run(() => queries.saveExpense(input))
  if (!result.ok) return result
  const user = await queries.getSessionUser()
  if (!user) return result
  if (!input.id) {
    notifyLater(() => notifyExpenseAdded(user, input, result.data))
  } else if (before) {
    const after = {
      ...before,
      description: input.description.trim(),
      amountPaise: input.amountPaise,
      payerId: input.payerId,
      expenseDate: input.expenseDate,
      category: input.category ?? null,
      shares: input.shares,
    }
    notifyLater(() => notifyExpenseEdited(user, before, after))
  }
  return result
}

export async function deleteExpenseAction(expenseId: string) {
  const before = await queries.expenseSnapshot(expenseId)
  const result = await run(() => queries.deleteExpense(expenseId))
  if (result.ok && before) {
    const user = await queries.getSessionUser()
    if (user) notifyLater(() => notifyExpenseDeleted(user, before))
  }
  return result
}

export async function flagExpenseAction(expenseId: string, reason: string) {
  return disputeStep("flagged", () => queries.flagExpense(expenseId, reason), reason)
}

export async function resolveFlagAction(flagId: string) {
  return disputeStep("resolved", () => queries.resolveFlag(flagId), null)
}

/** The person who added the expense asks the flagger to take another look and resolve. */
export async function requestResolveAction(flagId: string, note: string) {
  return disputeStep("resolve_requested", () => queries.requestResolve(flagId, note), note)
}

/** The flagger was asked to resolve but it is still wrong. */
export async function stillWrongAction(flagId: string, note: string) {
  return disputeStep("still_wrong", () => queries.stillWrong(flagId, note), note)
}

async function disputeStep(
  step: Parameters<typeof notifyDispute>[1],
  fn: () => Promise<queries.DisputeContext | null>,
  note: string | null,
): Promise<ActionResult<undefined>> {
  const result = await run(fn)
  if (!result.ok) return result
  const context = result.data
  if (context) {
    const user = await queries.getSessionUser()
    if (user) notifyLater(() => notifyDispute(user, step, context, note?.trim() || null))
  }
  return { ok: true, data: undefined }
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
