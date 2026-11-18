import { Skeleton } from "@/components/ui/skeleton"

export default function GroupLoading() {
  return (
    <div className="px-4 pt-6 md:px-0" aria-busy aria-label="Loading group">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-9 w-56" />
      <Skeleton className="mt-3 h-11 w-40 rounded-full" />
      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-8">
        <div className="space-y-3">
          <Skeleton className="h-36 w-full rounded-[16px] lg:hidden" />
          <Skeleton className="h-11 w-full rounded-[12px] lg:hidden" />
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-[16px]" />
          ))}
        </div>
        <div className="hidden space-y-4 lg:block">
          <Skeleton className="h-40 w-full rounded-[16px]" />
          <Skeleton className="h-16 w-full rounded-[16px]" />
          <Skeleton className="h-32 w-full rounded-[16px]" />
        </div>
      </div>
    </div>
  )
}
