import { JoinScreen } from "@/components/join-screen"
import { getSessionUser, previewInvite } from "@/lib/queries"

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const [user, preview] = await Promise.all([
    getSessionUser(),
    previewInvite(decodeURIComponent(code)),
  ])
  return <JoinScreen code={decodeURIComponent(code).toUpperCase()} preview={preview} user={user} />
}
