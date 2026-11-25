"use client"

import { useState } from "react"
import { CheckIcon, CopyIcon, ShareIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function useShare(title: string, text: string) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Copied. Paste it in WhatsApp or anywhere.")
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Could not copy")
    }
  }

  async function share() {
    if (typeof navigator.share !== "function") {
      await copy()
      return
    }
    try {
      await navigator.share({ title, text })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.error("Could not share")
    }
  }

  return { copied, copy, share }
}

export function ShareActions({ title, text }: { title: string; text: string }) {
  const { copied, copy, share } = useShare(title, text)
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      <Button type="button" variant="outline" size="xl" onClick={() => void copy()}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button type="button" size="xl" onClick={() => void share()}>
        <ShareIcon />
        Share
      </Button>
    </div>
  )
}

/** Small icon-only copy button for a short value such as an invite code. */
export function CopyIconButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const { copied, copy } = useShare(label, text)
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : label}
      className={cn("inline-flex size-10 items-center justify-center rounded-full transition active:scale-95", className)}
    >
      {copied ? <CheckIcon className="size-5" /> : <CopyIcon className="size-5" />}
    </button>
  )
}

/** The share message as plain text in a thin outline, no filled card. */
export function PlainMessage({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn("rounded-[14px] border border-border px-4 py-3.5 text-[15px] leading-6 break-words whitespace-pre-line text-foreground/90", className)}>
      {renderChatText(text)}
    </p>
  )
}

/** Renders a share message the way it will look in a chat, with a quick copy button. */
export function MessagePreview({ title, text, className }: { title: string; text: string; className?: string }) {
  const { copied, copy } = useShare(title, text)
  return (
    <figure className={cn("relative rounded-[16px] bg-accent/60 p-4 ring-1 ring-primary/15", className)}>
      <figcaption className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">Message preview</span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-2 text-xs font-semibold text-primary hover:bg-card"
        >
          {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <p className="rounded-[12px] rounded-tl-[4px] bg-card px-3.5 py-3 text-[15px] leading-6 break-words whitespace-pre-line shadow-sm">
        {renderChatText(text)}
      </p>
    </figure>
  )
}

/** Shows *bold* the way chat apps do and makes links stand out. */
function renderChatText(text: string) {
  return text.split(/(\*[^*\n]+\*|https?:\/\/\S+)/g).map((part, index) => {
    if (/^\*[^*]+\*$/.test(part)) return <strong key={index}>{part.slice(1, -1)}</strong>
    if (/^https?:\/\//.test(part)) {
      return (
        <span key={index} className="font-medium break-all text-primary">
          {part}
        </span>
      )
    }
    return <span key={index}>{part}</span>
  })
}
