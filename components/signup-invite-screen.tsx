"use client"

import { useState } from "react"
import Link from "next/link"

import { Mark } from "@/components/mark"
import { SignupForm, type SignupValues } from "@/components/signup-form"
import { Button } from "@/components/ui/button"
import { signUpWithLinkAction } from "@/lib/actions"
import type { SignupLinkPreview } from "@/lib/types"
import { useAction } from "@/lib/use-action"

export function SignupInviteScreen({ token, preview }: { token: string; preview: SignupLinkPreview }) {
  const [error, setError] = useState<string | null>(null)
  const { pending, run } = useAction()

  function submit(values: SignupValues) {
    setError(null)
    run(() => signUpWithLinkAction(token, values), {
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
          <div className="mt-6">
            <SignupForm
              onSubmit={submit}
              pending={pending}
              error={error}
              label="Create account"
              pendingLabel="Creating…"
            />
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already on Hissa? <Link href="/login" className="font-medium text-foreground underline">Sign in</Link>
          </p>
        </>
      )}
    </main>
  )
}
