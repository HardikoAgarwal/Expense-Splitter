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

export function PersonStack({ members }: { members: Member[] }) {
  const shown = members.slice(0, 3)
  const extra = members.length - shown.length
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((member) => (
        <Person
          key={member.id}
          id={member.id}
          name={member.displayName}
          className="size-11 text-[13px] tracking-tight ring-2 ring-background after:hidden"
        />
      ))}
      {extra > 0 ? (
        <div className="relative z-10 flex size-11 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-background">
          +{extra}
        </div>
      ) : null}
    </div>
  )
}
