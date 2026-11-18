import "server-only"

import { type PushSubscription, sendNotification, WebPushError } from "web-push"

import { isDemoMode } from "@/lib/env"
import { formatINR } from "@/lib/money"
import { createServiceClient } from "@/lib/supabase/service"
import {
  deleteRecipients,
  describeDelete,
  describeEdit,
  editRecipients,
  type ExpenseSnapshot,
  noticeTitle,
} from "@/lib/expense-changes"
import type { SaveExpenseInput, SessionUser } from "@/lib/types"

export type PushPayload = { title: string; body: string; url: string; tag?: string }

function vapid() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:hardikagg1874@gmail.com"
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

/** Push needs VAPID keys, the service role key and a real database. Without them it quietly does nothing. */
export function pushEnabled() {
  return !isDemoMode() && vapid() !== null && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

/** Server-side notices (Activity entries) need only the service role key and a real database. */
export function serverNotificationsEnabled() {
  return !isDemoMode() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

/** The public key the browser subscribes with, or null when push is not configured. */
export function pushPublicKey() {
  return pushEnabled() ? (vapid()?.publicKey ?? null) : null
}

/** Sends to every device of every listed user. Expired subscriptions (404/410) are deleted. */
export async function sendPush(userIds: string[], payload: PushPayload) {
  const keys = vapid()
  const targets = [...new Set(userIds)]
  if (!keys || !pushEnabled() || targets.length === 0) return
  const supabase = createServiceClient()
  const { data, error } = await supabase.from("push_subscriptions").select("id, endpoint, keys").in("user_id", targets)
  if (error || !data?.length) return

  const body = JSON.stringify(payload)
  const expired: string[] = []
  await Promise.all(
    data.map(async (row) => {
      const subscription = { endpoint: row.endpoint as string, keys: row.keys as PushSubscription["keys"] }
      try {
        await sendNotification(subscription, body, {
          vapidDetails: keys,
          TTL: 60 * 60 * 24,
          urgency: "normal",
          timeout: 8000,
        })
      } catch (error) {
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          expired.push(row.id as string)
        } else {
          console.warn("[push] send failed", error instanceof WebPushError ? error.statusCode : error)
        }
      }
    }),
  )
  if (expired.length) await supabase.from("push_subscriptions").delete().in("id", expired)
}

async function groupName(groupId: string) {
  const { data } = await createServiceClient().from("groups").select("name").eq("id", groupId).maybeSingle()
  return (data?.name as string | undefined) ?? "your group"
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name

/** Someone added an expense: tell everyone else who has a share in it. */
export async function notifyExpenseAdded(actor: SessionUser, input: SaveExpenseInput, expenseId: string) {
  if (!pushEnabled()) return
  const shares = input.shares.filter((share) => share.userId !== actor.id && share.sharePaise > 0)
  if (shares.length === 0) return
  const group = await groupName(input.groupId)
  await Promise.all(
    shares.map((share) =>
      sendPush([share.userId], {
        title: `New expense in ${group}`,
        body: `${first(actor.displayName)} added ${input.description} (${formatINR(input.amountPaise)}). Your share: ${formatINR(share.sharePaise)}.`,
        url: `/groups/${input.groupId}`,
        tag: `expense-${expenseId}`,
      }),
    ),
  )
}

/** A payment was recorded that the payee has to approve. */
export async function notifySettlementRequested(
  actor: SessionUser,
  input: { groupId: string; toUserId: string; amountPaise: number },
  settlementId: unknown,
) {
  if (!pushEnabled() || input.toUserId === actor.id) return
  const group = await groupName(input.groupId)
  await sendPush([input.toUserId], {
    title: `${first(actor.displayName)} paid you ${formatINR(input.amountPaise)}`,
    body: `In ${group}. Check you got it, then approve.`,
    url: `/groups/${input.groupId}/settle`,
    tag: `settlement-${String(settlementId)}`,
  })
}

/** The payee approved or declined a payment: tell whoever recorded it. */
export async function notifySettlementResolved(actor: SessionUser, settlementId: string, approved: boolean) {
  if (!pushEnabled()) return
  const { data } = await createServiceClient()
    .from("settlements")
    .select("group_id, from_user_id, created_by, amount_paise")
    .eq("id", settlementId)
    .maybeSingle()
  if (!data) return
  const recipients = [data.created_by as string, data.from_user_id as string].filter((id) => id && id !== actor.id)
  if (recipients.length === 0) return
  const group = await groupName(data.group_id as string)
  const amount = formatINR(Number(data.amount_paise))
  await sendPush(recipients, {
    title: approved ? "Payment approved" : "Payment declined",
    body: approved
      ? `${first(actor.displayName)} approved your ${amount} payment in ${group}.`
      : `${first(actor.displayName)} declined your ${amount} payment in ${group}. Check with them and record it again.`,
    url: `/groups/${data.group_id}/settle`,
    tag: `settlement-${settlementId}`,
  })
}

type ChangeNotice = { userId: string; sharePaise: number; summary: string }

/** Writes edited/deleted Activity notices. Quietly skips if the migration has not been applied yet. */
async function insertChangeNotices(
  kind: "edited" | "deleted",
  actorId: string,
  snapshot: ExpenseSnapshot,
  description: string,
  notices: ChangeNotice[],
) {
  if (notices.length === 0) return
  const { error } = await createServiceClient()
    .from("share_notices")
    .insert(
      notices.map((notice) => ({
        user_id: notice.userId,
        expense_id: kind === "deleted" ? null : snapshot.id,
        group_id: snapshot.groupId,
        actor_id: actorId,
        share_paise: notice.sharePaise,
        kind,
        summary: notice.summary,
        description,
      })),
    )
  if (error) console.warn("[notices] could not record", kind, error.message)
}

async function displayNames(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>()
  const { data } = await createServiceClient().from("profiles").select("id, display_name").in("id", ids)
  return new Map((data ?? []).map((row) => [row.id as string, row.display_name as string]))
}

const shareIn = (snapshot: ExpenseSnapshot, userId: string) =>
  snapshot.shares.find((share) => share.userId === userId)?.sharePaise ?? 0

/**
 * The creator edited an expense. Everyone who had or has a share (except the editor) gets an
 * Activity notice saying what changed for them, plus a push. People newly added to the split
 * already get the database's "added you" notice, so they only get the new-expense push.
 */
export async function notifyExpenseEdited(actor: SessionUser, before: ExpenseSnapshot, after: ExpenseSnapshot) {
  if (!serverNotificationsEnabled()) return
  const { added, edited } = editRecipients(before, after, actor.id)
  if (added.length === 0 && edited.length === 0) return
  const names = await displayNames([after.payerId])
  const nameOf = (id: string) => first(names.get(id) ?? "Someone")
  const description = after.description.trim()
  const notices = edited
    .map((userId) => ({ userId, sharePaise: shareIn(after, userId), summary: describeEdit(before, after, userId, nameOf) }))
    .filter((notice): notice is ChangeNotice => notice.summary !== null)
  await insertChangeNotices("edited", actor.id, after, description, notices)
  if (!pushEnabled()) return
  const group = await groupName(after.groupId)
  await Promise.all([
    ...notices.map((notice) =>
      sendPush([notice.userId], {
        title: noticeTitle("edited", first(actor.displayName), description),
        body: `${notice.summary} · ${group}`,
        url: `/groups/${after.groupId}`,
        tag: `expense-${after.id}`,
      }),
    ),
    ...added.map((userId) =>
      sendPush([userId], {
        title: `New expense in ${group}`,
        body: `${first(actor.displayName)} added you to ${description} (${formatINR(after.amountPaise)}). Your share: ${formatINR(shareIn(after, userId))}.`,
        url: `/groups/${after.groupId}`,
        tag: `expense-${after.id}`,
      }),
    ),
  ])
}

/** The creator deleted an expense: tell everyone who had a share in it. */
export async function notifyExpenseDeleted(actor: SessionUser, before: ExpenseSnapshot) {
  if (!serverNotificationsEnabled()) return
  const recipients = deleteRecipients(before, actor.id)
  if (recipients.length === 0) return
  const description = before.description.trim()
  const notices = recipients.map((userId) => ({
    userId,
    sharePaise: shareIn(before, userId),
    summary: describeDelete(before, userId),
  }))
  await insertChangeNotices("deleted", actor.id, before, description, notices)
  if (!pushEnabled()) return
  const group = await groupName(before.groupId)
  await Promise.all(
    notices.map((notice) =>
      sendPush([notice.userId], {
        title: noticeTitle("deleted", first(actor.displayName), description),
        body: `${notice.summary} · ${group}`,
        url: `/groups/${before.groupId}`,
        tag: `expense-${before.id}`,
      }),
    ),
  )
}
