"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Mark } from "@/components/mark"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { requestPasswordResetAction } from "@/lib/actions"

export function ForgotPasswordScreen({ demo }: { demo: boolean }) {
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await requestPasswordResetAction(email)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSent(true)
    toast.success("Check your email")
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <Mark className="size-12" />
        <h1 className="mt-5 text-[2rem] leading-none font-semibold tracking-tight">Reset password</h1>
        <p className="mt-3 text-sm text-muted-foreground">We will email you a link to choose a new one.</p>
      </div>

      {demo ? (
        <div className="mt-4 space-y-4">
          <Notice title="Demo mode">
            Email reset is off here. Sign in with a demo account, then change your password from Account.
          </Notice>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-[12px] bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
          >
            Back to sign in
          </Link>
        </div>
      ) : sent ? (
        <div className="mt-4 space-y-4">
          <Notice title="Email sent">If that address has an account, a reset link is on its way.</Notice>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-[12px] bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="mt-2 space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
          {error ? <Notice tone="negative" title="Could not send">{error}</Notice> : null}
          <Button type="submit" size="xl" className="w-full" disabled={email.trim().length === 0} pending={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
          <Link href="/login" className="block text-center text-sm font-medium text-primary">
            Back to sign in
          </Link>
        </form>
      )}
    </main>
  )
}
