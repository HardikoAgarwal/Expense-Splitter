import { ResetPasswordScreen } from "@/components/reset-password-screen"
import { getSessionUser } from "@/lib/queries"

export default async function ResetPasswordPage() {
  const user = await getSessionUser()
  return <ResetPasswordScreen signedIn={Boolean(user)} />
}