"use client"

import { useState } from "react"

export function ShowList<T>({
  items,
  limit = 6,
  render,
}: {
  items: T[]
  limit?: number
  render: (item: T) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const shown = open ? items : items.slice(0, limit)
  return (
    <>
      {shown.map(render)}
      {items.length > limit ? (
        <button type="button" className="h-11 w-full text-sm font-medium text-primary" onClick={() => setOpen((value) => !value)}>
          {open ? "Show less" : `Show all ${items.length}`}
        </button>
      ) : null}
    </>
  )
}
