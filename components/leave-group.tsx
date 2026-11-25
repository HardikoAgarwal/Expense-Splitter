"use client"

import Link from "next/link"
import { CheckIcon, HandCoinsIcon, MinusIcon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { leaveGroupAction, removeMemberAction } from "@/lib/actions"
import { formatINR } from "@/lib/money"
import { exitBlockFor, writeOffPreview } from "@/lib/members"
import type { GroupDetail, Member } from "@/lib/types"
import { useAction } from "@/lib/use-action"

/**
 * Leave a group (yourself) or remove someone else. Leaving needs a settled-up balance.
 * A group admin can remove someone who still has a balance by writing it off, and the
 * sheet shows exactly who loses what first. The database enforces the same rules.
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
  const hardBlock = target ? exitBlockFor(group, target.id, viewerId, { ignoreMoney: true }) : null
  const money = Boolean(reason && !hardBlock)
  const canWriteOff = Boolean(target && !self && money && group.myRole === "admin")
  const preview = canWriteOff && target ? writeOffPreview(group, target.id) : null

  function confirm(writeOff: boolean) {
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
    run(() => removeMemberAction(group.id, target.id, writeOff), {
      success: writeOff ? `${first} was removed and their balance written off` : `${first} was removed`,
      onSuccess: onClose,
    })
  }

  const points = self
    ? ["You lose access to this group", "Your past expenses stay in its history", "You can rejoin later with an invite code"]
    : [`${first} loses access right away`, "Their past expenses stay in the history", "They can rejoin later with an invite code"]

  let footer: React.ReactNode
  if (preview) {
    footer = (
      <div className="grid w-full grid-cols-2 gap-2">
        <Button variant="outline" size="xl" disabled={pending} onClick={onClose}>
          Keep
        </Button>
        <Button variant="destructive" size="xl" pending={pending} onClick={() => confirm(true)}>
          Write off &amp; remove
        </Button>
      </div>
    )
  } else if (reason) {
    footer =
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
  } else {
    footer = (
      <div className="grid w-full grid-cols-2 gap-2">
        <Button variant="outline" size="xl" disabled={pending} onClick={onClose}>
          {self ? "Stay" : "Keep"}
        </Button>
        <Button variant="destructive" size="xl" pending={pending} onClick={() => confirm(false)}>
          {self ? "Leave group" : "Remove"}
        </Button>
      </div>
    )
  }

  return (
    <AppSheet
      open={Boolean(target)}
      onOpenChange={(open) => !open && !pending && onClose()}
      title={self ? `Leave ${group.name}?` : `Remove ${first}?`}
      description={self ? undefined : `from ${group.name}`}
      footer={footer}
    >
      <div className="pb-2">
        {preview ? (
          <div className="space-y-4">
            <Notice tone="warning" title={`${first} has an unsettled balance`}>
              {reason}
            </Notice>
            <div>
              <p className="mb-2 text-sm font-medium">If you remove them anyway, this is written off</p>
              <ul className="space-y-2.5">
                {preview.lines.map((line) => (
                  <li key={line.name} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                      <MinusIcon className="size-3" />
                    </span>
                    <span>
                      {preview.direction === "owes" ? (
                        <>
                          <strong className="font-semibold">{line.name}</strong> won&apos;t receive{" "}
                          <span className="money">{formatINR(line.amountPaise)}</span>
                        </>
                      ) : (
                        <>
                          <strong className="font-semibold">{line.name}</strong> no longer owes {first}{" "}
                          <span className="money">{formatINR(line.amountPaise)}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
                {preview.pendingPayments > 0 ? (
                  <li className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
                      <MinusIcon className="size-3" />
                    </span>
                    <span>
                      {preview.pendingPayments === 1
                        ? "A payment waiting for approval is cancelled"
                        : `${preview.pendingPayments} payments waiting for approval are cancelled`}
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              It&apos;s recorded in the group&apos;s history. Everyone else&apos;s other balances don&apos;t change.
              Try settling up first if you can.
            </p>
          </div>
        ) : reason ? (
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
