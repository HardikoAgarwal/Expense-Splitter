"use client"

import { Button } from "@/components/ui/button"

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="px-5 pt-16">
      <h1 className="text-2xl font-semibold">Something slipped</h1>
      <p className="mt-2 text-sm text-muted-foreground">The ledger could not load. Try again.</p>
      <Button className="mt-6 h-12 rounded-[12px] px-5" onClick={() => reset()}>
        Retry
      </Button>
    </div>
  )
}
