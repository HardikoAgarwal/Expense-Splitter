"use client"

import { createContext, useContext, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BellIcon, PlusIcon, UserRoundIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { ExpenseSheet } from "@/components/expense-sheet"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { loadGroupAction } from "@/lib/actions"
import type { Expense, GroupCard, GroupDetail, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"

type ExpenseApi = {
  openExpense: (groupId?: string, expense?: Expense | null) => void
}

const ExpenseContext = createContext<ExpenseApi | null>(null)

export function useExpense() {
  const value = useContext(ExpenseContext)
  if (!value) throw new Error("useExpense must be used inside the app shell")
  return value
}

export function Shell({
  user,
  groups,
  pending,
  children,
}: {
  user: SessionUser
  groups: GroupCard[]
  pending: number
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [picker, setPicker] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [expense, setExpense] = useState<Expense | null>(null)

  async function openExpense(groupId?: string, existing?: Expense | null) {
    const match = pathname.match(/^\/groups\/([^/]+)/)
    const target = groupId ?? match?.[1]
    if (!target) {
      if (groups.length === 1) {
        await openExpense(groups[0].id, existing)
        return
      }
      setPicker(true)
      return
    }
    setExpense(existing ?? null)
    setOpen(true)
    setLoading(true)
    const result = await loadGroupAction(target)
    setLoading(false)
    if (!result.ok) {
      toast.error(result.error)
      setOpen(false)
      return
    }
    setDetail(result.data)
  }

  const hideFab = pathname.startsWith("/account") || pathname.includes("/settle")

  return (
    <ExpenseContext.Provider value={{ openExpense }}>
      <div className="relative flex h-dvh flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(var(--fab-size)+var(--bottom-nav-height)+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <nav className="grid h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] shrink-0 grid-cols-3 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
          <NavItem href="/groups" label="Groups" active={pathname.startsWith("/groups")}>
            <UsersIcon />
          </NavItem>
          <NavItem href="/activity" label="Activity" active={pathname.startsWith("/activity")} badge={pending}>
            <BellIcon />
          </NavItem>
          <NavItem href="/account" label="Account" active={pathname.startsWith("/account")}>
            <UserRoundIcon />
          </NavItem>
        </nav>
        {hideFab ? null : (
          <button
            type="button"
            onClick={() => void openExpense()}
            className="absolute right-4 bottom-[calc(var(--bottom-nav-height)+0.5rem+env(safe-area-inset-bottom))] z-30 flex size-[var(--fab-size)] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-8px_rgba(31,107,74,0.8)] transition active:scale-95"
          >
            <PlusIcon className="size-7" />
            <span className="sr-only">Add expense</span>
          </button>
        )}
      </div>
      <ExpenseSheet
        open={open}
        loading={loading}
        group={detail}
        expense={expense}
        userId={user.id}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setExpense(null)
        }}
      />
      <Sheet open={picker} onOpenChange={setPicker}>
        <SheetContent side="bottom" className="rounded-t-[28px] p-0">
          <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-muted" />
          <SheetHeader>
            <SheetTitle>Add to which group?</SheetTitle>
            <SheetDescription>Pick a home, then enter the expense.</SheetDescription>
          </SheetHeader>
          <div className="space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {groups.length === 0 ? (
              <p className="px-1 py-6 text-sm text-muted-foreground">Create a group first, then add an expense.</p>
            ) : (
              groups.map((group) => (
                <Button
                  key={group.id}
                  variant="outline"
                  className="h-12 w-full justify-start rounded-[12px] px-4 text-base"
                  onClick={() => {
                    setPicker(false)
                    void openExpense(group.id)
                  }}
                >
                  {group.name}
                </Button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </ExpenseContext.Provider>
  )
}

function NavItem({
  href,
  label,
  active,
  badge,
  children,
}: {
  href: string
  label: string
  active: boolean
  badge?: number
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span className="relative [&_svg]:size-[22px]">
        {children}
        {badge ? (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-semibold text-white">
            {badge}
          </span>
        ) : null}
      </span>
      {label}
    </Link>
  )
}
