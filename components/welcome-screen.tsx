"use client"

import { useState } from "react"

import { Mark } from "@/components/mark"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { redeemWelcomeAction } from "@/lib/actions"
import { useAction } from "@/lib/use-action"

export function WelcomeScreen({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { pending, run } = useAction()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    run(() => redeemWelcomeAction(token, password), {
      navigate: "/login",
      replace: true,
      success: "Password saved. Sign in with it.",
      onError: setError,
      toastError: false,
    })
  }

  return (
    <main className="flex min-h-dvh flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))]">
      <Mark className="size-12" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Set your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">Choose a password for this account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
        {error ? <Notice tone="negative" title="Could not save">{error}</Notice> : null}
        <Button type="submit" size="xl" className="w-full" disabled={password.length < 8} pending={pending}>
          {pending ? "Saving…" : "Save password"}
        </Button>
      </form>
    </main>
  )
}
