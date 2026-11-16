"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Mark } from "@/components/mark"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signInAction } from "@/lib/actions"
import { DEMO_ACCOUNTS } from "@/lib/env"
import { cn } from "@/lib/utils"

export function AuthScreen({ next, demo }: { next: string; demo: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await signInAction(email, password)
    setPending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success("Welcome back")
    router.push(next)
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:max-w-lg">
      <div className="pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <Mark className="size-12" />
        <h1 className="mt-5 text-[2.4rem] leading-none font-semibold tracking-tight">Hissa</h1>
        <p className="mt-3 text-sm text-muted-foreground">Invite only.</p>
      </div>

      <form onSubmit={(event) => void submit(event)} className="mt-2 space-y-3">
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="h-12 rounded-[12px] px-3.5 text-base"
        />
        {error ? <Notice tone="negative" title="Could not sign in">{error}</Notice> : null}
        <Button type="submit" size="xl" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : "Sign in"}
        </Button>
        <Link href="/forgot-password" className="block text-center text-sm font-medium text-primary">
          Forgot password?
        </Link>
      </form>

      {demo ? (
        <div className="mt-auto space-y-3">
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
  )
}
