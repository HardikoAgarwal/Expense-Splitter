import { Skeleton } from "@/components/ui/skeleton"

export default function GroupsLoading() {
  return (
    <div className="space-y-6 px-4 pt-6 md:px-0" aria-busy aria-label="Loading groups">
      <div className="flex items-end justify-between gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="hidden h-12 w-56 rounded-[12px] md:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <Skeleton className="h-20 rounded-[16px]" />
        <Skeleton className="h-20 rounded-[16px]" />
        <Skeleton className="hidden h-20 rounded-[16px] md:block" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-48 rounded-[16px]" />
        <Skeleton className="h-48 rounded-[16px]" />
        <Skeleton className="hidden h-48 rounded-[16px] xl:block" />
      </div>
    </div>
  )
}
