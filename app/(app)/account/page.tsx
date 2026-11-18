import { redirect } from "next/navigation"

import { AccountScreen } from "@/components/account-screen"
import { getSessionUser } from "@/lib/queries"

export default async function AccountPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")
  return (
    <div className="mx-auto w-full max-w-2xl">
      <AccountScreen user={user} />
    </div>
  )
}
