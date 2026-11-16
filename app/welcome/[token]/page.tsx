import { WelcomeScreen } from "@/components/welcome-screen"

export default async function WelcomePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <WelcomeScreen token={token} />
}
