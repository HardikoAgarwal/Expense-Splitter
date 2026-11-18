"use client"

import Link from "next/link"

import { Mark } from "@/components/mark"
import { Button } from "@/components/ui/button"
import { joinGroupAction } from "@/lib/actions"
import type { InvitePreview, SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"

export function JoinScreen({
  code,
  preview,
  user,
}: {
  code: string
  preview: InvitePreview
  user: SessionUser | null
}) {
  const { pending, run } = useAction()
  const next = `/join/${code}`

  function join() {
    run(() => joinGroupAction(code), {
      navigate: (data) => `/groups/${data.groupId}`,
      success: (data) => (data.alreadyMember ? "You are already in" : "You joined"),
    })
  }

  return (
    <main className="flex min-h-dvh flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8">
      <Mark className="size-12" />
      {!preview.valid ? (
        <>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            {preview.reason === "expired" ? "This invite expired" : "Invite not found"}
          </h1>
          <p className="mt-2 text-muted-foreground">Ask for a fresh link from someone in the group.</p>
        </>
      ) : (
        <>
          <p className="mt-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">You are invited</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{preview.groupName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {preview.memberCount} already in · {code}
          </p>
          <div className="mt-8">
            {!user ? (
              <Button size="xl" className="w-full" render={<Link href={`/login?next=${encodeURIComponent(next)}`} />}>
                Sign in to join
              </Button>
            ) : preview.reason === "already_member" && preview.groupId ? (
              <Button size="xl" className="w-full" render={<Link href={`/groups/${preview.groupId}`} />}>
                Open group
              </Button>
            ) : (
              <Button size="xl" className="w-full" pending={pending} onClick={join}>
                {pending ? "Joining…" : `Join ${preview.groupName}`}
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  )
}
