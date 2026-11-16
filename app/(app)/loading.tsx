import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-4 px-4 pt-6">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full rounded-[16px]" />
      <Skeleton className="h-24 w-full rounded-[16px]" />
      <Skeleton className="h-20 w-full rounded-[16px]" />
      <Skeleton className="h-20 w-full rounded-[16px]" />
    </div>
  )
}
