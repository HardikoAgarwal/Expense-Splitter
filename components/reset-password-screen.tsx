"use client"

import { useState } from "react"
import Link from "next/link"

import { Mark } from "@/components/mark"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updatePasswordAction } from "@/lib/actions"
import { useAction } from "@/lib/use-action"

export function ResetPasswordScreen({ signedIn }: { signedIn: boolean }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { pending, run } = useAction()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    setError(null)
    run(() => updatePasswordAction(password), {
      navigate: "/groups",
      replace: true,
      success: "Password updated",
      onError: setError,
      toastError: false,
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <Mark className="size-12" />
        <h1 className="mt-5 text-[2rem] leading-none font-semibold tracking-tight">New password</h1>
        <p className="mt-3 text-sm text-muted-foreground">Choose something you will remember.</p>
      </div>

      {!signedIn ? (
        <div className="mt-4 space-y-4">
          <Notice tone="negative" title="Link expired">
            Open the latest reset link from your email, or request a new one.
          </Notice>
          <Link
            href="/forgot-password"
            className="inline-flex h-12 w-full items-center justify-center rounded-[12px] bg-primary px-5 text-[15px] font-semibold text-primary-foreground"
          >
            Request a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-2 space-y-4">
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
          <Input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
          {error ? <Notice tone="negative" title="Could not save">{error}</Notice> : null}
          <Button type="submit" size="xl" className="w-full" disabled={password.length < 8} pending={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
      )}
    </main>
  )
}
