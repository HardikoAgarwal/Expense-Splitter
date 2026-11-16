import { redirect } from "next/navigation"

import { AdminScreen } from "@/components/admin-screen"
import { getSessionUser, listAppUsers } from "@/lib/queries"

export default async function AdminPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  if (!user.isAdmin) redirect("/account")
  const people = await listAppUsers()
  return <AdminScreen user={user} people={people} />
}
