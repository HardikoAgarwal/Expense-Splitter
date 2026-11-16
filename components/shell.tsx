"use client"

import { createContext, useContext, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BellIcon, PlusIcon, UserRoundIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { AppSheet } from "@/components/app-sheet"
import { ExpenseSheet } from "@/components/expense-sheet"
import { Button } from "@/components/ui/button"
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
      <div className="relative flex h-dvh flex-col md:flex-row">
        <aside className="hidden w-56 shrink-0 flex-col border-r bg-background/95 px-3 py-5 backdrop-blur-xl md:flex lg:w-64">
          <p className="px-3 text-sm font-semibold tracking-[0.18em] text-primary uppercase">Hissa</p>
          <nav className="mt-6 flex flex-1 flex-col gap-1">
            <SideNavItem href="/groups" label="Groups" active={pathname.startsWith("/groups")}>
              <UsersIcon />
            </SideNavItem>
            <SideNavItem href="/activity" label="Activity" active={pathname.startsWith("/activity")} badge={pending}>
              <BellIcon />
            </SideNavItem>
            <SideNavItem href="/account" label="Account" active={pathname.startsWith("/account")}>
              <UserRoundIcon />
            </SideNavItem>
          </nav>
          {hideFab ? null : (
            <Button className="mt-auto h-11 w-full rounded-[12px]" onClick={() => void openExpense()}>
              <PlusIcon className="size-4" />
              Add expense
            </Button>
          )}
          <p className="mt-3 truncate px-1 text-xs text-muted-foreground">{user.displayName}</p>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(var(--fab-size)+var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-8">
            <div className="mx-auto w-full max-w-3xl md:px-2 lg:max-w-4xl">{children}</div>
          </div>

          <nav className="grid h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] shrink-0 grid-cols-3 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
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
              className="absolute right-4 bottom-[calc(var(--bottom-nav-height)+0.5rem+env(safe-area-inset-bottom))] z-30 flex size-[var(--fab-size)] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_-8px_rgba(31,107,74,0.8)] transition active:scale-95 md:hidden"
            >
              <PlusIcon className="size-7" />
              <span className="sr-only">Add expense</span>
            </button>
          )}
        </div>
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

      <AppSheet open={picker} onOpenChange={setPicker} title="Add to which group?" description="Pick a home, then enter the expense.">
        <div className="space-y-2 pb-2">
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
      </AppSheet>
    </ExpenseContext.Provider>
  )
}

function SideNavItem({
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
        "relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="relative [&_svg]:size-[18px]">
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
