"use client"

import { useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Notice } from "@/components/notice"
import { Person } from "@/components/person"
import { Section } from "@/components/section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { signOutAction, updateNameAction, updatePasswordAction } from "@/lib/actions"
import type { SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export function AccountScreen({ user }: { user: SessionUser }) {
  const [name, setName] = useState(user.displayName)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const { theme, setTheme } = useTheme()
  const nameAction = useAction()
  const passwordAction = useAction()
  const signOutRunner = useAction()
  const saving = nameAction.pending
  const savingPassword = passwordAction.pending

  function save(event: React.FormEvent) {
    event.preventDefault()
    nameAction.run(() => updateNameAction(name), { success: "Name updated" })
  }

  function savePassword(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      toast.error("Passwords do not match")
      return
    }
    passwordAction.run(() => updatePasswordAction(password), {
      success: "Password updated",
      onSuccess: () => {
        setPassword("")
        setConfirm("")
      },
    })
  }

  function signOut() {
    signOutRunner.run(() => signOutAction(), { navigate: "/login", replace: true })
  }

  return (
    <div className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Account</p>
      <div className="mt-6 flex items-center gap-4">
        <Person id={user.id} name={user.displayName} className="size-16 text-lg" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.displayName}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {user.isAdmin ? (
        <Link
          href="/admin"
          className="mt-6 flex items-center justify-between rounded-[16px] bg-card px-4 py-4 ring-1 ring-border"
        >
          <span>
            <span className="block font-medium">People</span>
            <span className="text-sm text-muted-foreground">Create, disable, or remove accounts</span>
          </span>
          <span className="text-sm font-semibold text-primary">Open</span>
        </Link>
      ) : null}

      <form onSubmit={(event) => save(event)} className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">Name</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
        </label>
        <Button type="submit" size="lg" className="w-full" disabled={name.trim() === user.displayName} pending={saving}>
          {saving ? "Saving…" : "Save name"}
        </Button>
      </form>

      <form onSubmit={(event) => savePassword(event)} className="mt-6 space-y-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Password</p>
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
        <Button
          type="submit"
          size="lg"
          variant="outline"
          className="w-full"
          disabled={password.length < 8}
          pending={savingPassword}
        >
          {savingPassword ? "Saving…" : "Update password"}
        </Button>
      </form>

      <Section title="Appearance">
        <div className="grid grid-cols-3 gap-2 rounded-[12px] bg-muted p-1">
          {(
            [
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "System"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                "h-11 rounded-[12px] text-sm font-semibold",
                theme === value ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Section>

      {user.demo ? (
        <div className="mt-6">
          <Notice title="Demo mode">Local ledger. Sign in as the other roommate to approve a payment.</Notice>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="mt-8 w-full text-muted-foreground md:w-auto"
        pending={signOutRunner.pending}
        onClick={() => signOut()}
      >
        {signOutRunner.pending ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  )
}
