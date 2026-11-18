import { redirect } from "next/navigation"

import { AccountScreen } from "@/components/account-screen"
import { getSessionUser, listAppUsers } from "@/lib/queries"

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [user, { tab }] = await Promise.all([getSessionUser(), searchParams])
  if (!user) redirect("/login")
  const people = user.isAdmin ? await listAppUsers() : null
  return (
    <div className="mx-auto w-full max-w-3xl">
      <AccountScreen user={user} people={people} initialTab={tab === "users" ? "users" : "profile"} />
    </div>
  )
}
