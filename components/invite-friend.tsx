"use client"

import { useEffect, useRef, useState } from "react"

import { AppSheet } from "@/components/app-sheet"
import { MessagePreview, ShareActions } from "@/components/share-actions"
import { createSignupLinkAction } from "@/lib/actions"
import { appBaseUrl, appInviteMessage } from "@/lib/messages"
import type { SignupLink } from "@/lib/types"
import { useAction } from "@/lib/use-action"

/**
 * Invite someone to Hissa with one link. The invitee picks their own name, email and
 * password, so the inviter only shares the message. Any active member can use it.
 */
export function InviteFriendSheets({
  open,
  onOpenChange,
  inviterName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inviterName: string
}) {
  const [link, setLink] = useState<SignupLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const creating = useAction()
  const requested = useRef(false)

  // Make a fresh single-use link each time the sheet opens.
  useEffect(() => {
    if (!open) {
      requested.current = false
      return
    }
    if (requested.current) return
    requested.current = true
    setLink(null)
    setError(null)
    creating.run(() => createSignupLinkAction(), { onSuccess: setLink, onError: setError, toastError: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const text = link ? appInviteMessage({ inviter: inviterName, url: `${appBaseUrl()}${link.path}` }) : ""

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Invite someone to Hissa"
      description="They open the link and set their own name, email and password. It works once and expires in 7 days."
      footer={link ? <ShareActions title="Join me on Hissa" text={text} /> : undefined}
    >
      <div className="pb-2">
        {link ? (
          <MessagePreview title="Join me on Hissa" text={text} />
        ) : error ? (
          <p className="text-sm text-negative">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Making your link…</p>
        )}
      </div>
    </AppSheet>
  )
}
