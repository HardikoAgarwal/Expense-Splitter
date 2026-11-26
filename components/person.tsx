import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { avatarClass, initials } from "@/lib/money"
import type { Member } from "@/lib/types"
import { cn } from "@/lib/utils"

export function Person({
  id,
  name,
  size = "default",
  className,
}: {
  id: string
  name: string
  size?: "sm" | "default" | "lg"
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className={cn("font-semibold", avatarClass(id))}>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

export function PersonStack({
  members,
  max = 3,
  size = "default",
}: {
  members: Member[]
  max?: number
  size?: "xs" | "sm" | "default"
}) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  const dot = size === "xs" ? "size-6 text-[10px]" : size === "sm" ? "size-9 text-[12px]" : "size-11 text-[13px]"
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((member) => (
        <Person
          key={member.id}
          id={member.id}
          name={member.displayName}
          className={cn(dot, "tracking-tight ring-2 ring-background after:hidden")}
        />
      ))}
      {extra > 0 ? (
        <div
          className={cn(
            dot,
            "relative z-10 flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background",
          )}
        >
          +{extra}
        </div>
      ) : null}
    </div>
  )
}
