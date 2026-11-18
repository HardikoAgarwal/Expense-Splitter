import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pt-6 md:px-0" aria-busy aria-label="Loading">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-[16px]" />
      <Skeleton className="h-20 w-full rounded-[16px]" />
      <Skeleton className="h-20 w-full rounded-[16px]" />
    </div>
  )
}
