import { redirect } from "next/navigation"

import { AccountScreen } from "@/components/account-screen"
import { getSessionUser } from "@/lib/queries"

export default async function AccountPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  return <AccountScreen user={user} />
}
