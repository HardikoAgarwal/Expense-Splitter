import { SignupInviteScreen } from "@/components/signup-invite-screen"
import { previewSignupLink } from "@/lib/queries"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const preview = await previewSignupLink(token)
  return <SignupInviteScreen token={token} preview={preview} />
}
