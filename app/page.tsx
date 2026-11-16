import { redirect } from "next/navigation"

import { getSessionUser } from "@/lib/queries"

export default async function HomePage() {
  const user = await getSessionUser()
  redirect(user ? "/groups" : "/login")
}
