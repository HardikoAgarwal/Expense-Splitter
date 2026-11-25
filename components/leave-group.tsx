"use client"

import Link from "next/link"
import { CheckIcon, HandCoinsIcon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { leaveGroupAction, removeMemberAction } from "@/lib/actions"
import { exitBlockFor } from "@/lib/members"
import type { GroupDetail, Member } from "@/lib/types"
import { useAction } from "@/lib/use-action"

/**
 * Leave a group (yourself) or remove someone else. Only possible when settled up, and
 * the sheet says plainly what stays behind. The database enforces the same rule.
 */
export function ExitGroupSheet({
  group,
  viewerId,
  target,
  onClose,
}: {
  group: GroupDetail
  viewerId: string
  target: Member | null
  onClose: () => void
}) {
  const { pending, run } = useAction()
  const self = target?.id === viewerId
  const first = target?.displayName.split(" ")[0] ?? ""
  const reason = target ? exitBlockFor(group, target.id, viewerId) : null
  const money = Boolean(reason && /settle up|payment waiting/i.test(reason))

  function confirm() {
    if (!target) return
    if (self) {
      run(() => leaveGroupAction(group.id), {
        navigate: "/groups",
        replace: true,
        success: `You left ${group.name}`,
        onSuccess: onClose,
      })
      return
    }
    run(() => removeMemberAction(group.id, target.id), { success: `${first} was removed`, onSuccess: onClose })
  }

  const points = self
    ? ["You lose access to this group", "Your past expenses stay in its history", "You can rejoin later with an invite code"]
    : [`${first} loses access right away`, "Their past expenses stay in the history", "They can rejoin later with an invite code"]

  return (
    <AppSheet
      open={Boolean(target)}
      onOpenChange={(open) => !open && !pending && onClose()}
      title={self ? `Leave ${group.name}?` : `Remove ${first}?`}
      description={self ? undefined : `from ${group.name}`}
      footer={
        reason ? (
          self && money ? (
            <Button size="xl" className="w-full" render={<Link href={`/groups/${group.id}/settle`} />}>
              <HandCoinsIcon />
              Settle up
            </Button>
          ) : (
            <Button variant="outline" size="xl" className="w-full" onClick={onClose}>
              Got it
            </Button>
          )
        ) : (
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" size="xl" disabled={pending} onClick={onClose}>
              {self ? "Stay" : "Keep"}
            </Button>
            <Button variant="destructive" size="xl" pending={pending} onClick={confirm}>
              {self ? "Leave group" : "Remove"}
            </Button>
          </div>
        )
      }
    >
      <div className="pb-2">
        {reason ? (
          <Notice tone="warning" title={self ? "You can't leave yet" : `${first} can't be removed yet`}>
            {reason}
          </Notice>
        ) : (
          <ul className="space-y-3 py-1">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <CheckIcon className="size-3" />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppSheet>
  )
}
