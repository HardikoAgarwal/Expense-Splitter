"use client"

import { useState } from "react"
import Link from "next/link"

import { FIELD, FIELD_LABEL } from "@/components/field"
import { Mark } from "@/components/mark"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signUpWithLinkAction } from "@/lib/actions"
import type { SignupLinkPreview } from "@/lib/types"
import { useAction } from "@/lib/use-action"

export function SignupInviteScreen({ token, preview }: { token: string; preview: SignupLinkPreview }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { pending, run } = useAction()
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    run(() => signUpWithLinkAction(token, { name, email, password }), {
      navigate: "/groups",
      replace: true,
      success: (user) => `Welcome, ${user.displayName.split(" ")[0]}`,
      onError: setError,
      toastError: false,
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8">
      <Mark className="size-12" />
      {!preview.valid ? (
        <>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">This invite link is not valid</h1>
          <p className="mt-2 text-muted-foreground">It may have expired or already been used. Ask for a fresh one.</p>
          <Button variant="outline" size="xl" className="mt-6 w-full" render={<Link href="/login" />}>
            Go to sign in
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Join Hissa</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {preview.inviterName ? `${preview.inviterName.split(" ")[0]} invited you. ` : ""}Set up your account.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className={FIELD}>
              <label htmlFor="su-name" className={FIELD_LABEL}>
                Name
              </label>
              <Input
                id="su-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                className="h-12 rounded-[12px] px-3.5 text-base"
              />
            </div>
            <div className={FIELD}>
              <label htmlFor="su-email" className={FIELD_LABEL}>
                Email
              </label>
              <Input
                id="su-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="h-12 rounded-[12px] px-3.5 text-base"
              />
            </div>
            <div className={FIELD}>
              <label htmlFor="su-password" className={FIELD_LABEL}>
                Password
              </label>
              <Input
                id="su-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="h-12 rounded-[12px] px-3.5 text-base"
              />
            </div>
            {error ? <Notice tone="negative" title="Could not create account">{error}</Notice> : null}
            <Button
              type="submit"
              size="xl"
              className="w-full"
              disabled={name.trim().length < 2 || !emailValid || password.length < 8}
              pending={pending}
            >
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already on Hissa? <Link href="/login" className="font-medium text-foreground underline">Sign in</Link>
          </p>
        </>
      )}
    </main>
  )
}
