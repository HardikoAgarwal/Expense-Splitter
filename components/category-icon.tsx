import {
  CarIcon,
  HouseIcon,
  ShoppingCartIcon,
  SofaIcon,
  TagIcon,
  UtensilsIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  rent: HouseIcon,
  groceries: ShoppingCartIcon,
  utilities: ZapIcon,
  dining: UtensilsIcon,
  transport: CarIcon,
  household: SofaIcon,
  other: TagIcon,
}

const TINTS: Record<string, string> = {
  rent: "bg-[#E7F2EC] text-[#1F6B4A] dark:bg-[#1F6B4A]/20 dark:text-[#8EDEC0]",
  groceries: "bg-[#F8EBD8] text-[#8A5A12] dark:bg-[#8A5A12]/20 dark:text-[#F0C98A]",
  utilities: "bg-[#E5EEF8] text-[#24558A] dark:bg-[#24558A]/25 dark:text-[#A9C8EF]",
  dining: "bg-[#F8E4E0] text-[#9A3B2F] dark:bg-[#9A3B2F]/20 dark:text-[#F0B2A8]",
  transport: "bg-[#E8E6F6] text-[#43387A] dark:bg-[#43387A]/25 dark:text-[#C4BBE8]",
  household: "bg-[#E7F0EA] text-[#2E5C45] dark:bg-[#2E5C45]/25 dark:text-[#B7D7C6]",
  other: "bg-muted text-muted-foreground",
}

export function CategoryIcon({ category, className }: { category: string | null; className?: string }) {
  const key = category && ICONS[category] ? category : "other"
  const Icon = ICONS[key]
  return (
    <span
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-[12px]",
        TINTS[key],
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  )
}
