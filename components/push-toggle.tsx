"use client"

import { useEffect, useState } from "react"
import { BellIcon, BellOffIcon, ShareIcon } from "lucide-react"
import { toast } from "sonner"

import { deletePushSubscriptionAction, savePushSubscriptionAction } from "@/lib/actions"
import { isIOS, isStandalone } from "@/lib/pwa"
import { cn } from "@/lib/utils"

type Status = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on"

function base64UrlToBytes(value: string) {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/")
  if (existing) return existing
  await navigator.serviceWorker.register("/sw.js", { scope: "/" })
  return navigator.serviceWorker.ready
}

/** Settings row that turns push notifications on or off for this browser/device. */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [status, setStatus] = useState<Status>("loading")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check(): Promise<Status> {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
      if (!supported) return isIOS() && !isStandalone() ? "needs-install" : "unsupported"
      if (Notification.permission === "denied") return "denied"
      const reg = await navigator.serviceWorker.getRegistration("/")
      const subscription = await reg?.pushManager.getSubscription()
      return subscription ? "on" : "off"
    }
    check()
      .catch(() => "off" as const)
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    if (!publicKey) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off")
        return
      }
      const reg = await registration()
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }))
      const json = subscription.toJSON()
      const result = await savePushSubscriptionAction({
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        userAgent: navigator.userAgent,
      })
      if (!result.ok) {
        await subscription.unsubscribe().catch(() => undefined)
        toast.error(result.error)
        return
      }
      setStatus("on")
      toast.success("Notifications on for this device")
    } catch {
      toast.error("Couldn't turn on notifications. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration("/")
      const subscription = await reg?.pushManager.getSubscription()
      if (subscription) {
        await deletePushSubscriptionAction(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setStatus("off")
      toast.success("Notifications off for this device")
    } catch {
      toast.error("Couldn't turn off notifications. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const on = status === "on"
  const canToggle = Boolean(publicKey) && (status === "on" || status === "off")

  let hint: React.ReactNode = "New expenses with your share, and payments to approve."
  if (!publicKey) hint = "Not set up on this server yet."
  else if (status === "needs-install")
    hint = (
      <>
        On iPhone, first add Hissa to your Home Screen (<ShareIcon className="inline size-3.5 align-[-2px]" aria-label="Share" /> → Add to Home Screen), then open it from there.
      </>
    )
  else if (status === "unsupported") hint = "This browser doesn't support notifications."
  else if (status === "denied") hint = "Blocked in your browser settings. Allow notifications for this site, then come back."

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground [&_svg]:size-4">
        {on ? <BellIcon /> : <BellOffIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span id="push-label" className="block font-medium">
          Notifications on this device
        </span>
        <span id="push-hint" className="block text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="push-label"
        aria-describedby="push-hint"
        disabled={!canToggle || busy}
        onClick={() => (on ? disable() : enable())}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50",
          on ? "bg-primary" : "bg-muted-foreground/30",
          busy && "animate-pulse",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform",
            on && "translate-x-5",
          )}
        />
      </button>
    </div>
  )
}
