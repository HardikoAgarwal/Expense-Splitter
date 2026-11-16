"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, EllipsisIcon } from "lucide-react"
import { toast } from "sonner"

import { AppSheet } from "@/components/app-sheet"
import { Person } from "@/components/person"
import { ShareActions } from "@/components/share-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createAccountAction, removeUserAction, setUserDisabledAction } from "@/lib/actions"
import { accountInviteMessage, appBaseUrl } from "@/lib/messages"
import type { AppUser, CreatedAccount, SessionUser } from "@/lib/types"

export function AdminScreen({ user, people }: { user: SessionUser; people: AppUser[] }) {
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const [selected, setSelected] = useState<AppUser | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const router = useRouter()

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const result = await createAccountAction({ email, displayName: name })
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setCreated(result.data)
    setAddOpen(false)
    setName("")
    setEmail("")
    router.refresh()
  }

  async function toggle(person: AppUser) {
    const result = await setUserDisabledAction(person.id, !person.disabled)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(person.disabled ? "Account enabled" : "Account disabled")
    setSelected(null)
    router.refresh()
  }

  async function remove(person: AppUser) {
    const result = await removeUserAction(person.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Account removed")
    setSelected(null)
    setConfirmRemove(false)
    router.refresh()
  }

  const welcomeUrl = created ? `${appBaseUrl()}${created.welcomePath}` : ""
  const inviteText = created
    ? accountInviteMessage({
        name: created.displayName,
        appUrl: appBaseUrl(),
        email: created.email,
        temporaryPassword: created.temporaryPassword,
        welcomeUrl,
      })
    : ""

  return (
    <div className="px-4">
      <header className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <Link href="/account" className="flex size-11 items-center justify-center rounded-[12px] active:bg-muted">
          <ArrowLeftIcon className="size-5" />
          <span className="sr-only">Account</span>
        </Link>
        <p className="mt-3 text-xs font-medium tracking-[0.16em] text-primary uppercase">Admin</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-[1.7rem] font-semibold tracking-tight">People</h1>
        </div>
        <Button className="mt-4 h-12 w-full rounded-[12px]" onClick={() => setAddOpen(true)}>
          Add new user
        </Button>
      </header>

      <ul className="space-y-3">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-3 rounded-[16px] bg-card px-3 py-3 ring-1 ring-border">
            <Person id={person.id} name={person.displayName} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{person.displayName}</p>
              <p className="truncate text-sm text-muted-foreground">{person.email}</p>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {person.disabled ? "Disabled" : person.isAdmin ? "Admin" : "Active"}
            </span>
            {person.id !== user.id ? (
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-[12px] active:bg-muted"
                onClick={() => {
                  setConfirmRemove(false)
                  setSelected(person)
                }}
              >
                <EllipsisIcon className="size-5" />
                <span className="sr-only">Actions for {person.displayName}</span>
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <AppSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add new user"
        description="They get a temporary password."
        footer={
          <Button type="submit" form="add-user" size="xl" className="w-full" disabled={pending || name.trim().length < 2}>
            {pending ? "Creating…" : "Create account"}
          </Button>
        }
      >
        <form id="add-user" onSubmit={(event) => void create(event)} className="space-y-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="h-12 rounded-[12px] px-3.5 text-base" />
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-12 rounded-[12px] px-3.5 text-base" />
        </form>
      </AppSheet>

      <AppSheet
        open={Boolean(created)}
        onOpenChange={(open) => !open && setCreated(null)}
        title={created ? `Invite ${created.displayName}` : "Invite"}
        description="Password is shown only here."
        footer={<ShareActions title="Join Hissa" text={inviteText} />}
      >
        <p className="rounded-[12px] bg-muted p-3 text-sm leading-6">{inviteText}</p>
      </AppSheet>

      <AppSheet
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.displayName ?? "Person"}
        description={selected?.email}
      >
        {selected ? (
          <div className="space-y-3 pb-2">
            <button type="button" className="text-sm font-medium text-primary" onClick={() => void toggle(selected)}>
              {selected.disabled ? "Enable account" : "Disable account"}
            </button>
            <div>
              {confirmRemove ? (
                <button type="button" className="text-sm font-medium text-negative" onClick={() => void remove(selected)}>
                  Confirm delete
                </button>
              ) : (
                <button type="button" className="text-sm font-medium text-negative" onClick={() => setConfirmRemove(true)}>
                  Delete account
                </button>
              )}
            </div>
          </div>
        ) : null}
      </AppSheet>
    </div>
  )
}
