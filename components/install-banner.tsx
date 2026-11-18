"use client"

import { useEffect, useState } from "react"
import { DownloadIcon, ShareIcon, SquarePlusIcon, XIcon } from "lucide-react"

import { Mark } from "@/components/mark"
import { Button } from "@/components/ui/button"
import { useInstall } from "@/lib/pwa"

const DISMISSED = "hissa:install-dismissed"
const IOS_SHOWN = "hissa:ios-hint-shown"

/**
 * A quiet card offering to install Hissa. Chromium browsers get a real Install button;
 * iOS Safari gets the Share → Add to Home Screen hint, once.
 */
export function InstallBanner() {
  const { canPrompt, installed, ios, ready, install } = useInstall()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    if (!ready || installed) return
    try {
      if (localStorage.getItem(DISMISSED)) return
      if (ios) {
        if (localStorage.getItem(IOS_SHOWN)) return
        localStorage.setItem(IOS_SHOWN, "1")
      }
    } catch {
      return
    }
    // Reading storage has to wait for the browser, so this runs after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(false)
  }, [ready, installed, ios])

  function dismiss() {
    setHidden(true)
    try {
      localStorage.setItem(DISMISSED, "1")
    } catch {}
  }

  if (hidden || installed || (!canPrompt && !ios)) return null

  return (
    <div role="region" aria-label="Install Hissa" className="mx-4 mt-3 flex items-start gap-3 rounded-[16px] bg-card p-3.5 ring-1 ring-border md:mx-0 md:mt-6">
      <Mark className="size-10 shrink-0 rounded-[12px]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install Hissa</p>
        {canPrompt ? (
          <p className="mt-0.5 text-sm text-muted-foreground">Open it from your home screen like an app.</p>
        ) : (
          <p className="mt-0.5 text-sm text-muted-foreground">
            Tap <ShareIcon className="inline size-4 align-[-3px]" aria-label="Share" /> then{" "}
            <span className="font-medium text-foreground">
              Add to Home Screen <SquarePlusIcon className="inline size-4 align-[-3px]" aria-hidden />
            </span>
          </p>
        )}
        {canPrompt ? (
          <Button
            size="sm"
            className="mt-2.5"
            onClick={async () => {
              if (await install()) setHidden(true)
            }}
          >
            <DownloadIcon /> Install app
          </Button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="-m-1 flex size-9 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted"
      >
        <XIcon className="size-4" />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  )
}
