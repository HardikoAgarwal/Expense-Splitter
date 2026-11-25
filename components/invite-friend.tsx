"use client"

import { useState } from "react"

import { AppSheet } from "@/components/app-sheet"
import { FIELD, FIELD_LABEL, FIELDS } from "@/components/field"
import { MessagePreview, ShareActions } from "@/components/share-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createAccountAction } from "@/lib/actions"
import { accountInviteMessage, appBaseUrl } from "@/lib/messages"
import type { CreatedAccount } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

/** Sheets for inviting someone to Hissa. Any active member can use it. */
export function InviteFriendSheets({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const creating = useAction()
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  function create(event: React.FormEvent) {
    event.preventDefault()
    creating.run(() => createAccountAction({ email, displayName: name }), {
      onSuccess: (account) => {
        setCreated(account)
        onOpenChange(false)
        setName("")
        setEmail("")
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

  return (
    <>
      <AppSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Invite someone to Hissa"
        description="We create their account and give you a message to send them."
        footer={
          <Button
            type="submit"
            form="invite-friend"
            size="xl"
            className="w-full"
            disabled={name.trim().length < 2 || !emailValid}
            pending={creating.pending}
          >
            {creating.pending ? "Creating…" : "Create invite"}
          </Button>
        }
      >
        <form id="invite-friend" onSubmit={create} className={cn(FIELDS, "pb-2")}>
          <div className={FIELD}>
            <label htmlFor="invite-name" className={FIELD_LABEL}>
              Name
            </label>
            <Input
              id="invite-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Kabir Das"
              autoComplete="off"
              className="h-12 rounded-[12px] px-3.5 text-base"
            />
          </div>
          <div className={FIELD}>
            <label htmlFor="invite-email" className={FIELD_LABEL}>
              Email
            </label>
            <Input
              id="invite-email"
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
        onOpenChange={(next) => !next && setCreated(null)}
        title={created ? `${created.displayName.split(" ")[0]} is ready to join` : "Invite"}
        description="Send this now. The temporary password is only shown once."
        footer={<ShareActions title="You're invited to Hissa" text={inviteText} />}
      >
        <div className="pb-2">
          <MessagePreview title="You're invited to Hissa" text={inviteText} />
        </div>
      </AppSheet>
    </>
  )
}
