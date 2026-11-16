import Link from "next/link"

import { Mark } from "@/components/mark"

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col px-5 pt-16">
      <Mark className="size-12" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">That page is not here</h1>
      <p className="mt-2 text-muted-foreground">The group may be private, or the link is old.</p>
      <Link href="/groups" className="mt-6 text-sm font-semibold text-primary">
        Back to your groups
      </Link>
    </main>
  )
}
