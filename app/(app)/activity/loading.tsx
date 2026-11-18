import { Skeleton } from "@/components/ui/skeleton"

export default function ActivityLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 pt-6 md:px-0" aria-busy aria-label="Loading activity">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-44" />
      <div className="h-3" />
      {Array.from({ length: 7 }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-[16px]" />
      ))}
    </div>
  )
}
