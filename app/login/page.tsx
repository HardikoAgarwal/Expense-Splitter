import { redirect } from "next/navigation"

import { AuthScreen } from "@/components/auth-screen"
import { isDemoMode } from "@/lib/env"
import { safeNext } from "@/lib/paths"
import { getSessionUser } from "@/lib/queries"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const user = await getSessionUser()
  const next = safeNext((await searchParams).next)
  if (user) redirect(next)
  return <AuthScreen next={next} demo={isDemoMode()} />
}
