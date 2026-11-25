import "server-only"

import { adminBlockReason, generateSecret, inviteBlockReason, inviteLimitReason, mutateUserBlockReason } from "@/lib/admin"
import { AppError } from "@/lib/errors"
import { createServiceClient } from "@/lib/supabase/service"
import type { AppUser, CreatedAccount, SessionUser } from "@/lib/types"

function assertActor(actor: SessionUser) {
  const blocked = adminBlockReason({ isAdmin: actor.isAdmin, disabled: false, invited: true })
  if (blocked) throw new AppError(blocked)
}

export async function listAppUsers(actor: SessionUser): Promise<AppUser[]> {
  assertActor(actor)
  const admin = createServiceClient()
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, display_name, is_admin, disabled, created_at")
    .order("display_name")
  if (error) throw new AppError(error.message)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    isAdmin: Boolean(row.is_admin),
    disabled: Boolean(row.disabled),
    createdAt: row.created_at as string,
  }))
}

export async function createAccount(
  actor: SessionUser,
  input: { email: string; displayName: string },
): Promise<CreatedAccount> {
  const blocked = inviteBlockReason({ isAdmin: actor.isAdmin, disabled: false, invited: true })
  if (blocked) throw new AppError(blocked)
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (displayName.length < 2 || displayName.length > 40) {
    throw new AppError("Name must be 2–40 characters")
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email")
  const temporaryPassword = generateSecret(12)
  const admin = createServiceClient()
  if (!actor.isAdmin) {
    const { count, error: countError } = await admin
      .from("account_invites")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", actor.id)
    if (countError) throw new AppError(countError.message)
    const limited = inviteLimitReason({ isAdmin: false, disabled: false, invited: true }, count ?? 0)
    if (limited) throw new AppError(limited)
  }
  const created = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (created.error || !created.data.user) {
    throw new AppError(created.error?.message ?? "Could not create that account")
  }
  const userId = created.data.user.id
  const { error: profileError } = await admin
    .from("profiles")
    .update({ invited: true, is_admin: false, disabled: false, display_name: displayName })
    .eq("id", userId)
  if (profileError) throw new AppError(profileError.message)
  const token = generateSecret(24)
  const { error: inviteError } = await admin.from("account_invites").insert({
    user_id: userId,
    invited_by: actor.id,
    token,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (inviteError) throw new AppError(inviteError.message)
  return {
    id: userId,
    email,
    displayName,
    temporaryPassword,
    welcomePath: `/welcome/${token}`,
  }
}

export async function setUserDisabled(actor: SessionUser, userId: string, disabled: boolean) {
  const blocked = mutateUserBlockReason(
    { id: actor.id, isAdmin: actor.isAdmin, disabled: false, invited: true },
    userId,
  )
  if (blocked) throw new AppError(blocked)
  const admin = createServiceClient()
  const { error } = await admin.from("profiles").update({ disabled }).eq("id", userId)
  if (error) throw new AppError(error.message)
}

export async function removeUser(actor: SessionUser, userId: string) {
  const blocked = mutateUserBlockReason(
    { id: actor.id, isAdmin: actor.isAdmin, disabled: false, invited: true },
    userId,
  )
  if (blocked) throw new AppError(blocked)
  const admin = createServiceClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) {
    if (/foreign key|violates/i.test(error.message)) {
      throw new AppError("This person has expenses. Disable their account instead.")
    }
    throw new AppError(error.message)
  }
}

export async function redeemWelcome(token: string, password: string) {
  if (password.length < 8) throw new AppError("Use at least 8 characters")
  const admin = createServiceClient()
  const { data, error } = await admin
    .from("account_invites")
    .select("id, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle()
  if (error) throw new AppError(error.message)
  if (!data || data.used_at || Date.parse(data.expires_at as string) <= Date.now()) {
    throw new AppError("This invite link is invalid or expired")
  }
  const updated = await admin.auth.admin.updateUserById(data.user_id as string, { password })
  if (updated.error) throw new AppError(updated.error.message)
  const { error: inviteError } = await admin
    .from("account_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id)
  if (inviteError) throw new AppError(inviteError.message)
  const { data: profile } = await admin.from("profiles").select("email").eq("id", data.user_id).maybeSingle()
  return (profile?.email as string) ?? ""
}
