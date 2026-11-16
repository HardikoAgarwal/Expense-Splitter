import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { generateSecret } from "../lib/admin"
import { IDS, seedExpenses } from "../lib/demo/seed-data"
import { DEMO_ACCOUNTS } from "../lib/env"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !anon || !service || url.includes("your-project") || anon.includes("your-anon")) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY before seeding.",
  )
  process.exit(1)
}

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function ensureUser(email: string, password: string, name: string) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  if (!created.error && created.data.user) return created.data.user.id
  const listed = await admin.auth.admin.listUsers({ perPage: 200 })
  const existing = listed.data.users.find((user) => user.email?.toLowerCase() === email)
  if (!existing) throw created.error ?? new Error(`Could not create ${email}`)
  await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  })
  return existing.id
}

function asUser() {
  return createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function signIn(email: string, password: string) {
  const client = asUser()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function main() {
  const [aaravAccount, meeraAccount] = DEMO_ACCOUNTS
  const aaravId = await ensureUser(aaravAccount.email, aaravAccount.password, aaravAccount.name)
  const meeraId = await ensureUser(meeraAccount.email, meeraAccount.password, meeraAccount.name)
  const idMap = new Map<string, string>([
    [IDS.aarav, aaravId],
    [IDS.meera, meeraId],
  ])

  const { error: wipeError } = await admin.from("groups").delete().in("created_by", [aaravId, meeraId])
  if (wipeError) throw wipeError

  const aarav = await signIn(aaravAccount.email, aaravAccount.password)
  const flatId = await rpc<string>(aarav, "create_group", { p_name: "Flat 4B" })
  const invite = await rpc<{ code: string }>(aarav, "create_invite", { p_group_id: flatId })

  const meera = await signIn(meeraAccount.email, meeraAccount.password)
  await rpc(meera, "join_group_by_code", { p_code: invite.code })

  for (const expense of seedExpenses()) {
    const payerId = idMap.get(expense.payerId) ?? expense.payerId
    const client = payerId === meeraId ? meera : aarav
    await rpc(client, "save_expense", {
      p_id: null,
      p_group_id: flatId,
      p_description: expense.description,
      p_amount_paise: expense.amountPaise,
      p_payer_id: payerId,
      p_expense_date: expense.expenseDate,
      p_category: expense.category,
      p_shares: expense.shares.map((share) => ({
        user_id: idMap.get(share.userId) ?? share.userId,
        share_paise: share.sharePaise,
      })),
    })
  }

  const approved = await rpc<string>(meera, "request_settlement", {
    p_group_id: flatId,
    p_to: aaravId,
    p_amount: 1_200_000,
    p_up_to: "2026-10-31",
  })
  await rpc(aarav, "resolve_settlement", { p_id: approved, p_approve: true })
  await rpc(meera, "request_settlement", {
    p_group_id: flatId,
    p_to: aaravId,
    p_amount: 800_000,
    p_up_to: "2026-11-10",
  })

  const tripId = await rpc<string>(meera, "create_group", { p_name: "Monsoon trip" })
  const tripInvite = await rpc<{ code: string }>(meera, "create_invite", { p_group_id: tripId })
  await rpc(aarav, "join_group_by_code", { p_code: tripInvite.code })

  const adminEmail = (process.env.ADMIN_EMAIL || aaravAccount.email).trim().toLowerCase()
  let adminPasswordNote = ""
  if (adminEmail !== aaravAccount.email && adminEmail !== meeraAccount.email) {
    const password = generateSecret(12)
    await ensureUser(adminEmail, password, process.env.ADMIN_NAME || "Admin")
    adminPasswordNote = password
  }
  const { error: inviteError } = await admin
    .from("profiles")
    .update({ invited: true })
    .in("email", [aaravAccount.email, meeraAccount.email, adminEmail])
  if (inviteError) throw inviteError
  const { error: adminError } = await admin
    .from("profiles")
    .update({ is_admin: true, invited: true })
    .eq("email", adminEmail)
  if (adminError) throw adminError

  console.log("Seeded Flat 4B and Monsoon trip.")
  console.log(`  ${aaravAccount.email} / ${aaravAccount.password}`)
  console.log(`  ${meeraAccount.email} / ${meeraAccount.password}`)
  console.log(`  Admin: ${adminEmail}`)
  if (adminPasswordNote) console.log(`  Admin temporary password: ${adminPasswordNote}`)
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
