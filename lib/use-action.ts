"use client"

import { useCallback, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import type { ActionResult } from "@/lib/types"

type Message<T> = string | ((data: T) => string | null) | null | undefined

export type RunOptions<T> = {
  /** Toast shown once the screen already shows the change. */
  success?: Message<T>
  /** Runs together with the success toast, after the new data has rendered (close a sheet, reset a form). */
  onSuccess?: (data: T) => void
  onError?: (error: string) => void
  /** Set false when the screen shows the error inline instead. */
  toastError?: boolean
  /** Navigate inside the same transition, so the toast waits for the next screen. */
  navigate?: string | ((data: T) => string | null)
  replace?: boolean
}

function flush(queue: { current: Array<() => void> }) {
  if (queue.current.length === 0) return
  const jobs = queue.current
  queue.current = []
  for (const job of jobs) job()
}

/**
 * Runs a server action inside a React transition.
 *
 * Server actions here call revalidatePath, so their response already carries the
 * refreshed screen. Keeping the call (and any navigation) inside one transition
 * means `pending` stays true until React has committed that new screen. Success
 * work is queued until then, so a toast never appears before the list, balance,
 * or dashboard it talks about.
 */
export function useAction() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const queue = useRef<Array<() => void>>([])

  useEffect(() => {
    if (pending) return
    flush(queue)
  }, [pending])

  // When the action navigated away, this screen unmounts exactly as the next
  // screen commits. That is the moment to show the toast.
  useEffect(() => {
    const jobs = queue
    return () => flush(jobs)
  }, [])

  const run = useCallback(
    <T,>(action: () => Promise<ActionResult<T>>, options: RunOptions<T> = {}) => {
      startTransition(async () => {
        let result: ActionResult<T>
        try {
          result = await action()
        } catch {
          result = { ok: false, error: "Network problem. Check your connection and try again." }
        }
        if (!result.ok) {
          const error = result.error
          queue.current.push(() => {
            if (options.toastError !== false) toast.error(error)
            options.onError?.(error)
          })
          return
        }
        const data = result.data
        const href = typeof options.navigate === "function" ? options.navigate(data) : options.navigate
        if (href) {
          if (options.replace) router.replace(href)
          else router.push(href)
        }
        queue.current.push(() => {
          options.onSuccess?.(data)
          const message = typeof options.success === "function" ? options.success(data) : options.success
          if (message) toast.success(message)
        })
      })
    },
    [router],
  )

  return { pending, run }
}
