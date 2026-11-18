"use client"

import { useState } from "react"
import { BanIcon, CheckCircle2Icon, EllipsisIcon, SearchIcon, Trash2Icon, UserPlusIcon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { Person } from "@/components/person"
import { MessagePreview, ShareActions } from "@/components/share-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createAccountAction, removeUserAction, setUserDisabledAction } from "@/lib/actions"
import { accountInviteMessage, appBaseUrl } from "@/lib/messages"
import type { AppUser, CreatedAccount, SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

/** Admin-only list of accounts: add, disable, delete, and share the invite after creating. */
export function ManageUsers({ user, people }: { user: SessionUser; people: AppUser[] }) {
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [query, setQuery] = useState("")
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const [selected, setSelected] = useState<AppUser | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const creating = useAction()
  const updating = useAction()
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  function create(event: React.FormEvent) {
    event.preventDefault()
    creating.run(() => createAccountAction({ email, displayName: name }), {
      onSuccess: (account) => {
        setCreated(account)
        setAddOpen(false)
        setName("")
        setEmail("")
      },
    })
  }

  function toggle(person: AppUser) {
    updating.run(() => setUserDisabledAction(person.id, !person.disabled), {
      success: person.disabled ? "Account enabled" : "Account disabled",
      onSuccess: () => setSelected(null),
    })
  }

  function remove(person: AppUser) {
    updating.run(() => removeUserAction(person.id), {
      success: "Account deleted",
      onSuccess: () => {
        setSelected(null)
        setConfirmRemove(false)
      },
    })
  }

  const inviteText = created
    ? accountInviteMessage({
        name: created.displayName,
        email: created.email,
        temporaryPassword: created.temporaryPassword,
        welcomeUrl: `${appBaseUrl()}${created.welcomePath}`,
      })
    : ""

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? people.filter((person) => `${person.displayName} ${person.email}`.toLowerCase().includes(needle))
    : people
  const active = people.filter((person) => !person.disabled).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">People</h2>
          <p className="text-sm text-muted-foreground">
            {people.length} accounts · {active} active
          </p>
        </div>
        <Button size="lg" onClick={() => setAddOpen(true)}>
          <UserPlusIcon />
          Add user
        </Button>
      </div>

      {people.length > 5 ? (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="people-search" className="sr-only">
            Search people
          </label>
          <Input
            id="people-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or email"
            className="h-11 rounded-[12px] pl-10 text-base"
          />
        </div>
      ) : null}

      <ul className="divide-y overflow-hidden rounded-[16px] bg-card ring-1 ring-border">
        {shown.map((person) => {
          const isMe = person.id === user.id
          return (
            <li key={person.id} className="flex items-center gap-3 px-4 py-3">
              <Person id={person.id} name={person.displayName} />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium", person.disabled && "text-muted-foreground line-through")}>
                  {person.displayName}
                  {isMe ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">{person.email}</p>
              </div>
              <StatusBadge person={person} />
              {isMe ? (
                <span className="size-10" aria-hidden />
              ) : (
                <button
                  type="button"
                  className="flex size-10 items-center justify-center rounded-[12px] text-muted-foreground hover:bg-muted active:bg-muted"
                  onClick={() => {
                    setConfirmRemove(false)
                    setSelected(person)
                  }}
                >
                  <EllipsisIcon className="size-5" />
                  <span className="sr-only">Manage {person.displayName}</span>
                </button>
              )}
            </li>
          )
        })}
        {shown.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No one matches that.</li> : null}
      </ul>

      <AppSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add a new user"
        description="We create the account and give you a message to send them."
        footer={
          <Button
            type="submit"
            form="add-user"
            size="xl"
            className="w-full"
            disabled={name.trim().length < 2 || !emailValid}
            pending={creating.pending}
          >
            {creating.pending ? "Creating…" : "Create account"}
          </Button>
        }
      >
        <form id="add-user" onSubmit={create} className="space-y-4 pb-2">
          <div className="space-y-1.5">
            <label htmlFor="new-user-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Kabir Das"
              autoComplete="off"
              className="h-12 rounded-[12px] px-3.5 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="new-user-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="kabir@example.com"
              autoComplete="off"
              aria-invalid={email.length > 3 && !emailValid ? true : undefined}
              className="h-12 rounded-[12px] px-3.5 text-base"
            />
            {email.length > 3 && !emailValid ? <p className="text-xs text-negative">Enter a valid email.</p> : null}
          </div>
        </form>
      </AppSheet>

      <AppSheet
        open={Boolean(created)}
        onOpenChange={(open) => !open && setCreated(null)}
        title={created ? `${created.displayName.split(" ")[0]} is ready to join` : "Invite"}
        description="Send this now. The temporary password is only shown once."
        footer={<ShareActions title="You're invited to Hissa" text={inviteText} />}
      >
        <div className="pb-2">
          <MessagePreview title="You're invited to Hissa" text={inviteText} />
        </div>
      </AppSheet>

      <AppSheet
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.displayName ?? "Person"}
        description={selected?.email}
      >
        {selected ? (
          <div className="space-y-2 pb-4">
            <Button
              variant="outline"
              size="xl"
              className="w-full justify-start"
              pending={updating.pending && !confirmRemove}
              onClick={() => toggle(selected)}
            >
              {selected.disabled ? <CheckCircle2Icon /> : <BanIcon />}
              {selected.disabled ? "Enable account" : "Disable account"}
            </Button>
            {confirmRemove ? (
              <div className="space-y-2 rounded-[12px] bg-negative/8 p-3">
                <p className="text-sm">
                  Delete {selected.displayName.split(" ")[0]}&apos;s account? They lose access right away.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="lg" onClick={() => setConfirmRemove(false)}>
                    Keep
                  </Button>
                  <Button variant="destructive" size="lg" pending={updating.pending} onClick={() => remove(selected)}>
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="xl"
                className="w-full justify-start text-negative hover:text-negative"
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2Icon />
                Delete account
              </Button>
            )}
          </div>
        ) : null}
      </AppSheet>
    </div>
  )
}

function StatusBadge({ person }: { person: AppUser }) {
  const label = person.disabled ? "Disabled" : person.isAdmin ? "Admin" : "Active"
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        person.disabled
          ? "bg-muted text-muted-foreground"
          : person.isAdmin
            ? "bg-primary/10 text-primary"
            : "bg-positive/10 text-positive",
      )}
    >
      {label}
    </span>
  )
}
