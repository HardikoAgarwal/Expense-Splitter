"use client"

import { useState } from "react"
import Link from "next/link"

import { Mark } from "@/components/mark"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signInAction } from "@/lib/actions"
import { DEMO_ACCOUNTS } from "@/lib/env"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export function AuthScreen({ next, demo }: { next: string; demo: boolean }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { pending, run } = useAction()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    // The button keeps spinning until the dashboard has rendered; the greeting comes after.
    run(() => signInAction(email, password), {
      navigate: next,
      replace: true,
      success: (user) => `Welcome back, ${user.displayName.split(" ")[0]}`,
      onError: setError,
      toastError: false,
    })
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="gradient-hero relative hidden flex-col justify-between overflow-hidden p-12 lg:flex" aria-hidden>
        <div className="flex items-center gap-3">
          <Mark className="size-10" />
          <span className="text-xl font-semibold tracking-tight">Hissa</span>
        </div>
        <div className="max-w-md">
          <p className="text-[2.6rem] leading-[1.1] font-semibold tracking-tight">Split rent, groceries and everything in between.</p>
          <p className="mt-4 text-base text-white/75">
            One shared ledger for your flat. Everyone sees who paid, who owes, and settles up without the awkward maths.
          </p>
        </div>
        <p className="text-sm text-white/60">Invite only · Private to your group</p>
      </aside>
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:max-w-lg lg:justify-center lg:px-12"
    >
      <div className="pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 lg:pt-0">
        <Mark className="size-12 lg:hidden" />
        <h1 className="mt-5 text-[2.4rem] leading-none font-semibold tracking-tight lg:mt-0">
          <span className="lg:hidden">Hissa</span>
          <span className="hidden lg:inline">Welcome back</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Invite only. Sign in with the account your admin made for you.</p>
      </div>

      <form onSubmit={submit} className="mt-2 space-y-3">
        <label htmlFor="login-email" className="sr-only">
          Email
        </label>
        <Input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
        <label htmlFor="login-password" className="sr-only">
          Password
        </label>
        <Input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
        {error ? <Notice tone="negative" title="Could not sign in">{error}</Notice> : null}
        <Button type="submit" size="xl" className="w-full" pending={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <Link href="/forgot-password" className="block text-center text-sm font-medium text-primary">
          Forgot password?
        </Link>
      </form>

      {demo ? (
        <div className="mt-auto space-y-3 lg:mt-10">
          <Notice title="Demo flat">Aarav is the admin. Password demo1234.</Notice>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email)
                  setPassword(account.password)
                }}
                className={cn(
                  "rounded-[12px] border px-3 py-2.5 text-left text-sm font-medium",
                  email === account.email ? "border-primary bg-accent" : "border-border",
                )}
              >
                {account.name.split(" ")[0]}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{account.email}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </main>
    </div>
  )
}
