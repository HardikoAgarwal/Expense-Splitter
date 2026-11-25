import "server-only"

import { adminBlockReason, generateSecret, inviteBlockReason, inviteLimitReason, mutateUserBlockReason, SIGNUP_LINK_DAYS, signupInputReason } from "@/lib/admin"
import { AppError } from "@/lib/errors"
import { createServiceClient } from "@/lib/supabase/service"
import type { AppUser, CreatedAccount, SessionUser, SignupLink, SignupLinkPreview } from "@/lib/types"

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
  assertActor(actor)
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (displayName.length < 2 || displayName.length > 40) {
    throw new AppError("Name must be 2–40 characters")
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email")
  const temporaryPassword = generateSecret(12)
  const admin = createServiceClient()
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

export async function createSignupLink(actor: SessionUser): Promise<SignupLink> {
  const blocked = inviteBlockReason({ isAdmin: actor.isAdmin, disabled: false, invited: true })
  if (blocked) throw new AppError(blocked)
  const admin = createServiceClient()
  if (!actor.isAdmin) {
    const { count, error } = await admin
      .from("signup_links")
      .select("id", { count: "exact", head: true })
      .eq("created_by", actor.id)
    if (error) throw new AppError(error.message)
    const limited = inviteLimitReason({ isAdmin: false, disabled: false, invited: true }, count ?? 0)
    if (limited) throw new AppError(limited)
  }
  const token = generateSecret(24)
  const expiresAt = new Date(Date.now() + SIGNUP_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await admin.from("signup_links").insert({ token, created_by: actor.id, expires_at: expiresAt })
  if (error) throw new AppError(error.message)
  return { path: `/invite/${token}`, expiresAt }
}

export async function previewSignupLink(token: string): Promise<SignupLinkPreview> {
  const admin = createServiceClient()
  const { data } = await admin
    .from("signup_links")
    .select("expires_at, used_at, created_by")
    .eq("token", token)
    .maybeSingle()
  if (!data || data.used_at || Date.parse(data.expires_at as string) <= Date.now()) return { valid: false }
  const { data: inviter } = await admin.from("profiles").select("display_name").eq("id", data.created_by).maybeSingle()
  return { valid: true, inviterName: (inviter?.display_name as string | undefined) ?? undefined }
}

/** Creates the account for a single-use link. Returns the email so the caller can sign them in. */
export async function redeemSignupLink(token: string, input: { name: string; email: string; password: string }) {
  const problem = signupInputReason(input)
  if (problem) throw new AppError(problem)
  const email = input.email.trim().toLowerCase()
  const displayName = input.name.trim()
  const admin = createServiceClient()
  // Claim the link first so two people cannot use it at once.
  const { data: claimed, error: claimError } = await admin
    .from("signup_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle()
  if (claimError) throw new AppError(claimError.message)
  if (!claimed) throw new AppError("This invite link is invalid or already used")
  const release = () => admin.from("signup_links").update({ used_at: null }).eq("id", claimed.id)
  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (created.error || !created.data.user) {
    await release()
    const message = created.error?.message ?? ""
    throw new AppError(/already|registered|exists/i.test(message) ? "An account with that email already exists" : "Could not create your account")
  }
  const userId = created.data.user.id
  const { error: profileError } = await admin
    .from("profiles")
    .update({ invited: true, is_admin: false, disabled: false, display_name: displayName })
    .eq("id", userId)
  if (profileError) throw new AppError(profileError.message)
  await admin.from("signup_links").update({ used_by: userId }).eq("id", claimed.id)
  return email
}
