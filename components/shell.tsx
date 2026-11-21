"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { BarChart3Icon, BellIcon, PlusIcon, ShieldCheckIcon, UserRoundIcon, UsersIcon } from "lucide-react"
import { toast } from "sonner"

import { AppSheet } from "@/components/app-sheet"
import { BackLink } from "@/components/back-link"
import { ExpenseSheet } from "@/components/expense-sheet"
import { InstallBanner } from "@/components/install-banner"
import { Mark } from "@/components/mark"
import { Person } from "@/components/person"
import { Button } from "@/components/ui/button"
import { loadGroupAction } from "@/lib/actions"
import { formatINR } from "@/lib/money"
import type { Expense, GroupCard, GroupDetail, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"

type ExpenseApi = {
  openExpense: (groupId?: string, expense?: Expense | null) => void
  /** A group screen shares the detail it already has, so Add expense opens instantly. */
  registerGroup: (group: GroupDetail | null) => void
}

const ExpenseContext = createContext<ExpenseApi | null>(null)

type StickyChromeApi = {
  target: HTMLElement | null
  subheadHeight: number
  setHasSubhead: (on: boolean) => void
}

const StickyChromeContext = createContext<StickyChromeApi | null>(null)

export function useExpense() {
  const value = useContext(ExpenseContext)
  if (!value) throw new Error("useExpense must be used inside the app shell")
  return value
}

/** Registers the group on screen with the shell for as long as the screen is mounted. */
export function useRegisterGroup(group: GroupDetail) {
  const { registerGroup } = useExpense()
  useEffect(() => {
    registerGroup(group)
    return () => registerGroup(null)
  }, [group, registerGroup])
}

/** Renders into the shell’s sticky top chrome on mobile so nav + page head blur as one bar. */
export function StickySubhead({ children }: { children: ReactNode }) {
  const chrome = useContext(StickyChromeContext)
  const setHasSubhead = chrome?.setHasSubhead

  useLayoutEffect(() => {
    if (!setHasSubhead) return
    setHasSubhead(true)
    return () => setHasSubhead(false)
  }, [setHasSubhead])

  if (!chrome?.target) return null
  return createPortal(children, chrome.target)
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
  const searchParams = useSearchParams()
  const usersTab = pathname.startsWith("/account") && searchParams.get("tab") === "users"
  const [picker, setPicker] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [expense, setExpense] = useState<Expense | null>(null)
  const [hasSubhead, setHasSubhead] = useState(false)
  const [subheadHeight, setSubheadHeight] = useState(0)
  const [subheadTarget, setSubheadTarget] = useState<HTMLElement | null>(null)
  const subheadRef = useRef<HTMLDivElement>(null)
  const onScreen = useRef<GroupDetail | null>(null)

  const registerGroup = useCallback((group: GroupDetail | null) => {
    onScreen.current = group
    // Keep an open sheet in step with fresh server data after a save elsewhere.
    if (group) setDetail((current) => (current && current.id === group.id ? group : current))
  }, [])

  const openExpense = useCallback(
    async (groupId?: string, existing?: Expense | null) => {
      const match = pathname.match(/^\/groups\/([^/]+)/)
      const target = groupId ?? match?.[1] ?? (groups.length === 1 ? groups[0].id : undefined)
      if (!target) {
        setPicker(true)
        return
      }
      setExpense(existing ?? null)
      setOpen(true)
      const known = onScreen.current?.id === target ? onScreen.current : null
      if (known) {
        setDetail(known)
        setLoading(false)
        return
      }
      setDetail(null)
      setLoading(true)
      const result = await loadGroupAction(target)
      setLoading(false)
      if (!result.ok) {
        toast.error(result.error)
        setOpen(false)
        return
      }
      setDetail(result.data)
    },
    [groups, pathname],
  )

  const hideFab =
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    pathname.includes("/settle") ||
    pathname.includes("/summary")
  const activeGroupId = pathname.match(/^\/groups\/([^/]+)/)?.[1] ?? null
  const groupSub = pathname.match(/^\/groups\/([^/]+)(\/(settle|summary))?$/)
  // Pin the top bar on group detail / settle / summary so it stays with those sticky headers.
  const pinTopBar = Boolean(groupSub)
  const topBack = groupSub
    ? groupSub[2]
      ? {
          href: `/groups/${groupSub[1]}`,
          label: groups.find((group) => group.id === groupSub[1])?.name ?? "Group",
        }
      : { href: "/groups", label: "Groups" }
    : null

  useLayoutEffect(() => {
    setSubheadTarget(subheadRef.current)
  }, [pinTopBar, hasSubhead])

  useLayoutEffect(() => {
    const el = subheadRef.current
    if (!el || !hasSubhead) {
      setSubheadHeight(0)
      return
    }
    const sync = () => setSubheadHeight(el.offsetHeight)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasSubhead])

  const stickyChrome = useMemo(
    () => ({ target: subheadTarget, subheadHeight, setHasSubhead }),
    [subheadTarget, subheadHeight],
  )

  return (
    <ExpenseContext.Provider value={{ openExpense, registerGroup }}>
      <StickyChromeContext.Provider value={stickyChrome}>
      <div className="relative flex h-dvh flex-col md:flex-row">
        <aside
          aria-label="Main"
          className="hidden w-60 shrink-0 flex-col border-r bg-card/70 px-3 py-5 backdrop-blur-xl md:flex lg:w-72 lg:px-4"
        >
          <Link href="/groups" className="flex items-center gap-2.5 px-2">
            <Mark className="size-8" />
            <span className="text-lg font-semibold tracking-tight">Hissa</span>
          </Link>

          <Button size="lg" className="mt-6 w-full" onClick={() => void openExpense()}>
            <PlusIcon />
            Add expense
          </Button>

          <nav className="mt-6 flex flex-col gap-1">
            <SideNavItem href="/groups" label="Groups" active={pathname === "/groups"}>
              <UsersIcon />
            </SideNavItem>
            <SideNavItem href="/activity" label="Activity" active={pathname.startsWith("/activity")} badge={pending}>
              <BellIcon />
            </SideNavItem>
            <SideNavItem href="/summary" label="Summary" active={pathname.startsWith("/summary") || pathname.endsWith("/summary")}>
              <BarChart3Icon />
            </SideNavItem>
            <SideNavItem href="/account" label="Account" active={pathname.startsWith("/account") && !usersTab}>
              <UserRoundIcon />
            </SideNavItem>
            {user.isAdmin ? (
              <SideNavItem href="/account?tab=users" label="Manage users" active={usersTab}>
                <ShieldCheckIcon />
              </SideNavItem>
            ) : null}
          </nav>

          {groups.length > 0 ? (
            <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
              <p className="px-3 pb-2 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">Your groups</p>
              <ul className="space-y-0.5">
                {groups.map((group) => (
                  <li key={group.id}>
                    <Link
                      href={`/groups/${group.id}`}
                      aria-current={activeGroupId === group.id ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-sm transition",
                        activeGroupId === group.id
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{group.name}</span>
                      <span className={cn("money shrink-0 text-xs", tone(group.myNetPaise))}>
                        {group.myNetPaise === 0 ? "settled" : formatINR(group.myNetPaise, { signed: true })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <Link
            href="/account"
            className="mt-4 flex items-center gap-3 rounded-[12px] px-2 py-2 transition hover:bg-muted"
          >
            <Person id={user.id} name={user.displayName} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{user.displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </Link>
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <main
            id="main"
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(var(--fab-size)+0.75rem)] md:pb-10"
          >
            <div className="mx-auto w-full max-w-6xl md:px-8 md:pt-4 lg:px-10">
              <div
                className={cn(
                  "md:hidden",
                  pinTopBar &&
                    "sticky top-0 z-30 bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/65",
                )}
              >
                <div className="flex items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1.5">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <Link href="/groups" className="flex shrink-0 touch-manipulation items-center gap-2.5">
                      <Mark className="size-8 shrink-0" />
                      <span className="text-[1.05rem] font-semibold tracking-tight">Hissa</span>
                    </Link>
                    {topBack ? (
                      <>
                        <span className="h-4 w-px shrink-0 bg-border/70" aria-hidden />
                        <BackLink href={topBack.href} label={topBack.label} variant="bar" className="min-w-0" />
                      </>
                    ) : null}
                  </div>
                  <Link
                    href="/account"
                    aria-label="Account"
                    className="touch-manipulation shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Person id={user.id} name={user.displayName} />
                  </Link>
                </div>
                <div
                  ref={subheadRef}
                  className={cn(hasSubhead ? "px-4 pb-2.5" : "pointer-events-none h-0 overflow-hidden")}
                />
              </div>
              {pathname === "/groups" ? <InstallBanner /> : null}
              {children}
            </div>
          </main>

          <nav
            aria-label="Main"
            className="relative z-20 grid h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] shrink-0 grid-cols-4 bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            <NavItem href="/groups" label="Groups" active={pathname.startsWith("/groups") && !pathname.endsWith("/summary")}>
              <UsersIcon />
            </NavItem>
            <NavItem href="/activity" label="Activity" active={pathname.startsWith("/activity")} badge={pending}>
              <BellIcon />
            </NavItem>
            <NavItem href="/summary" label="Summary" active={pathname.startsWith("/summary") || pathname.endsWith("/summary")}>
              <BarChart3Icon />
            </NavItem>
            <NavItem href="/account" label="Account" active={pathname.startsWith("/account") || pathname.startsWith("/admin")}>
              <UserRoundIcon />
            </NavItem>
          </nav>

          {hideFab ? null : (
            <button
              type="button"
              onClick={() => void openExpense()}
              className="absolute right-4 bottom-[calc(var(--bottom-nav-height)+0.75rem+env(safe-area-inset-bottom))] z-30 flex size-[var(--fab-size)] items-center justify-center rounded-[18px] gradient-primary shadow-[0_12px_30px_-8px_rgba(31,107,74,0.8)] transition active:scale-95 md:hidden"
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

      <AppSheet open={picker} onOpenChange={setPicker} title="Add to which group?" description="Pick a group, then enter the expense.">
        <div className="space-y-2 pb-2">
          {groups.length === 0 ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">Create a group first, then add an expense.</p>
          ) : (
            groups.map((group) => (
              <Button
                key={group.id}
                variant="outline"
                className="h-12 w-full justify-between rounded-[12px] px-4 text-base"
                onClick={() => {
                  setPicker(false)
                  void openExpense(group.id)
                }}
              >
                <span className="truncate">{group.name}</span>
                <span className="text-xs text-muted-foreground">{group.members.length} people</span>
              </Button>
            ))
          )}
        </div>
      </AppSheet>
      </StickyChromeContext.Provider>
    </ExpenseContext.Provider>
  )
}

function tone(net: number) {
  if (net > 0) return "text-positive"
  if (net < 0) return "text-negative"
  return "text-muted-foreground"
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="[&_svg]:size-[18px]">{children}</span>
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-negative px-1.5 text-[11px] font-semibold text-white">
          {badge}
          <span className="sr-only"> new</span>
        </span>
      ) : null}
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
      prefetch
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative z-10 flex h-16 touch-manipulation flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="pointer-events-none relative [&_svg]:size-[22px]">
        {children}
        {badge ? (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-semibold text-white">
            {badge}
            <span className="sr-only"> new</span>
          </span>
        ) : null}
      </span>
      <span className="pointer-events-none">{label}</span>
    </Link>
  )
}
