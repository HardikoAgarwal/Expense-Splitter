"use client"

import { CopyIcon, ShareIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

export function ShareActions({ title, text }: { title: string; text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied")
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

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" className="h-12 rounded-[12px]" onClick={() => void copy()}>
        <CopyIcon />
        Copy
      </Button>
      <Button type="button" className="h-12 rounded-[12px]" onClick={() => void share()}>
        <ShareIcon />
        Share
      </Button>
    </div>
  )
}
