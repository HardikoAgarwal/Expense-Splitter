"use client"

import { useSyncExternalStore } from "react"

/** The Chromium install event; not in the DOM typings yet. */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferred: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

let wired = false
function wire() {
  if (wired || typeof window === "undefined") return
  wired = true
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    installed = true
    emit()
  })
}

function subscribe(listener: () => void) {
  wire()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isStandalone() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
}

type InstallState = { canPrompt: boolean; installed: boolean; ios: boolean; ready: boolean }
let snapshot: InstallState = { canPrompt: false, installed: false, ios: false, ready: false }
const serverSnapshot: InstallState = snapshot

function read(): InstallState {
  const next = { canPrompt: Boolean(deferred), installed: installed || isStandalone(), ios: isIOS(), ready: true }
  if (
    next.canPrompt !== snapshot.canPrompt ||
    next.installed !== snapshot.installed ||
    next.ios !== snapshot.ios ||
    !snapshot.ready
  ) {
    snapshot = next
  }
  return snapshot
}

export function useInstall() {
  const state = useSyncExternalStore(subscribe, read, () => serverSnapshot)
  async function install() {
    if (!deferred) return false
    const event = deferred
    deferred = null
    await event.prompt()
    const { outcome } = await event.userChoice
    emit()
    return outcome === "accepted"
  }
  return { ...state, install }
}

/** Call early so the install event is not missed before any component subscribes. */
export function wireInstallPrompt() {
  wire()
}
