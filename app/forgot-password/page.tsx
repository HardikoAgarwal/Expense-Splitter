import { ForgotPasswordScreen } from "@/components/forgot-password-screen"
import { isDemoMode } from "@/lib/env"

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen demo={isDemoMode()} />
}
