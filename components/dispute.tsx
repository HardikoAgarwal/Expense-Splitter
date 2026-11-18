"use client"

import { useState } from "react"
import { CheckIcon, MessageCircleIcon, PencilIcon, RotateCcwIcon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { Button } from "@/components/ui/button"
import { requestResolveAction, resolveFlagAction, stillWrongAction } from "@/lib/actions"
import { formatDay } from "@/lib/money"
import type { DisputeEvent, ExpenseFlag } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

const first = (name: string) => name.trim().split(/\s+/)[0] || name

/** A centered dialog with one optional note and one clear button. Used for every dispute step. */
export function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  submitLabel,
  icon,
  pending,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  label: string
  placeholder: string
  submitLabel: string
  icon?: React.ReactNode
  pending: boolean
  onSubmit: (note: string) => void
}) {
  const [note, setNote] = useState("")
  return (
    <AppSheet
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
        if (!next) setNote("")
      }}
      title={title}
      description={description}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-12 rounded-[12px]" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="dispute-note" className="h-12 rounded-[12px]" pending={pending}>
            {icon}
            {submitLabel}
          </Button>
        </div>
      }
    >
      <form
        id="dispute-note"
        className="grid gap-2.5 pb-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(note.trim())
        }}
      >
        <label htmlFor="dispute-note-text" className="block text-sm leading-none font-medium">
          {label} <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="dispute-note-text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
          rows={3}
          placeholder={placeholder}
          className="w-full resize-none rounded-[12px] border border-input bg-transparent px-3.5 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">{note.length}/200</p>
      </form>
    </AppSheet>
  )
}

export type DisputeView = {
  flagId: string
  description: string
  role: "owner" | "flagger"
  awaiting: ExpenseFlag["awaiting"]
  flaggerName: string
  ownerName: string
  canEdit: boolean
  updatedSinceRaised: boolean
}

/**
 * The one next step for the viewer on a dispute, with its dialogs.
 * Owner: fix it (edit) and ask the flagger to resolve. Flagger: resolve, or say it's still wrong.
 */
export function DisputeActions({
  view,
  onEdit,
  onDone,
  askPrimary,
  className,
}: {
  view: DisputeView
  onEdit?: () => void
  onDone?: () => void
  /** Where Edit lives elsewhere (the detail footer), say whether Ask is the main step. */
  askPrimary?: boolean
  className?: string
}) {
  const action = useAction()
  const [dialog, setDialog] = useState<"ask" | "wrong" | null>(null)
  const flagger = first(view.flaggerName)
  const owner = first(view.ownerName)

  function ask(note: string) {
    action.run(() => requestResolveAction(view.flagId, note), {
      success: `Sent to ${flagger}`,
      onSuccess: () => {
        setDialog(null)
        onDone?.()
      },
    })
  }

  function wrong(note: string) {
    action.run(() => stillWrongAction(view.flagId, note), {
      success: `Sent back to ${owner}`,
      onSuccess: () => {
        setDialog(null)
        onDone?.()
      },
    })
  }

  function resolve() {
    action.run(() => resolveFlagAction(view.flagId), { success: "Dispute resolved", onSuccess: () => onDone?.() })
  }

  if (view.role === "owner" && view.awaiting === "flagger") {
    return <p className={cn("text-sm text-muted-foreground", className)}>Waiting for {flagger} to check it.</p>
  }

  if (view.role === "flagger" && view.awaiting === "owner") {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <p className="text-sm text-muted-foreground">Waiting for {owner} to fix it.</p>
        <Button variant="ghost" size="sm" className="shrink-0 rounded-[10px]" pending={action.pending} onClick={resolve}>
          It&apos;s fine now
        </Button>
      </div>
    )
  }

  if (view.role === "flagger") {
    return (
      <>
        <div className={cn("grid grid-cols-2 gap-2", className)}>
          <Button variant="outline" className="h-11 rounded-[12px]" disabled={action.pending} onClick={() => setDialog("wrong")}>
            <RotateCcwIcon /> Still wrong
          </Button>
          <Button className="h-11 rounded-[12px]" pending={action.pending && dialog === null} onClick={resolve}>
            <CheckIcon /> Resolve
          </Button>
        </div>
        <NoteDialog
          open={dialog === "wrong"}
          onOpenChange={(open) => setDialog(open ? "wrong" : null)}
          title="Still wrong?"
          description={`${owner} will get it back to fix ${view.description}.`}
          label="What's still off"
          placeholder="e.g. I wasn't at dinner, so take me off the split"
          submitLabel={`Send to ${owner}`}
          pending={action.pending}
          onSubmit={wrong}
        />
      </>
    )
  }

  const both = Boolean(onEdit && view.canEdit)
  const askFirst = askPrimary ?? (view.updatedSinceRaised || !both)
  return (
    <>
      <div className={cn("grid gap-2", both ? "grid-cols-2" : "grid-cols-1", className)}>
        {both ? (
          <Button
            variant={askFirst ? "outline" : "default"}
            className="h-11 rounded-[12px]"
            disabled={action.pending}
            onClick={onEdit}
          >
            <PencilIcon /> Edit expense
          </Button>
        ) : null}
        <Button
          variant={askFirst ? "default" : "outline"}
          className="h-11 rounded-[12px]"
          disabled={action.pending}
          onClick={() => setDialog("ask")}
        >
          <MessageCircleIcon /> {both ? "Ask to resolve" : `Ask ${flagger} to resolve`}
        </Button>
      </div>
      <NoteDialog
        open={dialog === "ask"}
        onOpenChange={(open) => setDialog(open ? "ask" : null)}
        title={`Ask ${flagger} to resolve`}
        description={`${flagger} gets a notification to check ${view.description} and resolve it.`}
        label="What did you change"
        placeholder="e.g. Took you off the split"
        submitLabel={`Send to ${flagger}`}
        pending={action.pending}
        onSubmit={ask}
      />
    </>
  )
}

const EVENT_TEXT: Record<DisputeEvent["kind"], (name: string) => string> = {
  flagged: (name) => `${name} flagged it`,
  resolve_requested: (name) => `${name} asked to resolve`,
  still_wrong: (name) => `${name}: still wrong`,
  resolved: (name) => `${name} resolved it`,
}

/** The dispute's story in a few short lines: who did what, with their note. */
export function DisputeThread({
  flag,
  viewerId,
  nameOf,
}: {
  flag: ExpenseFlag
  viewerId: string
  nameOf: (id: string) => string
}) {
  return (
    <ol className="space-y-2.5" aria-label="Dispute history">
      {flag.events.map((event) => (
        <li key={event.id} className="flex gap-2.5 text-sm">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              event.kind === "flagged" || event.kind === "still_wrong" ? "bg-warning" : "bg-primary",
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{EVENT_TEXT[event.kind](event.actorId === viewerId ? "You" : first(nameOf(event.actorId)))}</span>
            <span className="text-muted-foreground"> · {formatDay(event.createdAt.slice(0, 10))}</span>
            {event.note ? <span className="mt-0.5 block text-muted-foreground">“{event.note}”</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

