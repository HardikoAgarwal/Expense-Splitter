"use client"

import { useState } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowDownLeftIcon, ArrowUpRightIcon, BellIcon, ChevronRightIcon, UsersIcon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { Person, PersonStack } from "@/components/person"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createGroupAction, joinGroupAction } from "@/lib/actions"
import { formatINR } from "@/lib/money"
import { parseJoinCode } from "@/lib/messages"
import type { GroupCard, SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export function GroupsHome({
  user,
  groups,
  unseen = 0,
}: {
  user: SessionUser
  groups: GroupCard[]
  /** Expenses other people added you to that you have not opened yet. */
  unseen?: number
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const creating = useAction()
  const joining = useAction()
  const reduce = useReducedMotion()
  const hour = new Date().getHours()
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  const owed = groups.reduce((sum, group) => sum + Math.max(group.myNetPaise, 0), 0)
  const owe = groups.reduce((sum, group) => sum + Math.max(-group.myNetPaise, 0), 0)
  const approvals = groups.reduce((sum, group) => sum + group.pendingForMe, 0)
  const disputed = groups.reduce((sum, group) => sum + group.disputedCount, 0)

  function create(event: React.FormEvent) {
    event.preventDefault()
    // Stay on the sheet with a spinner until the new group page is ready.
    creating.run(() => createGroupAction(name), {
      navigate: (id) => `/groups/${id}`,
      success: "Group created",
      onSuccess: () => {
        setCreateOpen(false)
        setName("")
      },
    })
  }

  function join(event: React.FormEvent) {
    event.preventDefault()
    const parsed = parseJoinCode(code)
    if (!parsed) return
    joining.run(() => joinGroupAction(parsed), {
      navigate: (data) => `/groups/${data.groupId}`,
      success: (data) => (data.alreadyMember ? "You are already in" : "You joined"),
      onSuccess: () => {
        setJoinOpen(false)
        setCode("")
      },
    })
  }

  return (
    <div className="px-4 md:px-0">
      <header className="flex items-center justify-between pt-[max(1rem,env(safe-area-inset-top))] pb-4 md:hidden">
        <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Hissa</p>
        <Link href="/account" aria-label="Account">
          <Person id={user.id} name={user.displayName} />
        </Link>
      </header>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:pt-6">
        <div>
          <p className="hidden text-sm font-medium tracking-[0.18em] text-primary uppercase md:block">Overview</p>
          <h1 suppressHydrationWarning className="text-[1.7rem] leading-tight font-semibold tracking-tight md:mt-1 md:text-[2.1rem]">
            {hello}, {user.displayName.split(" ")[0]}
          </h1>
        </div>
        {groups.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button size="xl" className="flex-1 md:flex-none" onClick={() => setCreateOpen(true)}>
              Create a group
            </Button>
            <Button size="xl" variant="outline" className="md:flex-none" onClick={() => setJoinOpen(true)}>
              Join
            </Button>
          </div>
        ) : null}
      </div>

      {groups.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <Stat
            label="You are owed"
            value={formatINR(owed)}
            tone="positive"
            icon={<ArrowDownLeftIcon className="size-4" />}
          />
          <Stat label="You owe" value={formatINR(owe)} tone="negative" icon={<ArrowUpRightIcon className="size-4" />} />
          {approvals + disputed + unseen > 0 ? (
            <Link
              href="/activity"
              className="col-span-2 flex items-center gap-3 rounded-[16px] bg-warning/12 px-4 py-3.5 ring-1 ring-warning/25 transition hover:bg-warning/18 md:col-span-1 md:flex-col md:items-start md:gap-1"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <BellIcon className="size-4 text-warning" /> Needs you
              </span>
              <span className="flex-1 text-sm font-semibold md:text-lg">
                {[
                  approvals ? `${approvals} to approve` : null,
                  unseen ? `${unseen} new for you` : null,
                  disputed ? `${disputed} disputed` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <ChevronRightIcon className="size-4 text-muted-foreground md:hidden" />
            </Link>
          ) : (
            <div className="col-span-2 hidden rounded-[16px] bg-card px-4 py-3.5 ring-1 ring-border md:col-span-1 md:block">
              <span className="text-sm font-medium text-muted-foreground">Needs you</span>
              <p className="mt-1 text-lg font-semibold">All clear</p>
            </div>
          )}
        </div>
      ) : null}

      <section className="mt-8" aria-labelledby="groups-heading">
        {groups.length > 0 ? (
          <h2 id="groups-heading" className="mb-3 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Your groups · {groups.length}
          </h2>
        ) : (
          <h2 id="groups-heading" className="sr-only">
            Your groups
          </h2>
        )}
        {groups.length === 0 ? (
          <div className="flex flex-col items-center rounded-[16px] bg-card px-6 py-12 text-center ring-1 ring-border md:py-16">
            <span className="flex size-14 items-center justify-center rounded-[16px] bg-accent text-accent-foreground">
              <UsersIcon className="size-6" />
            </span>
            <h3 className="mt-4 text-lg font-semibold">Start your first group</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Make one for your flat, or join a roommate&apos;s group with their invite code.
            </p>
            <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <Button size="xl" className="flex-1" onClick={() => setCreateOpen(true)}>
                Create a group
              </Button>
              <Button size="xl" variant="outline" className="flex-1" onClick={() => setJoinOpen(true)}>
                Join with a code
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 6) * 0.03, duration: 0.25 }}
              >
                <Link
                  href={`/groups/${group.id}`}
                  className="group block h-full rounded-[16px] bg-card p-5 ring-1 ring-border shadow-[0_16px_40px_-28px_rgba(40,30,10,0.7)] transition hover:-translate-y-0.5 hover:ring-primary/30 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <PersonStack members={group.members} />
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {group.pendingForMe > 0 ? (
                        <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
                          {group.pendingForMe} to approve
                        </span>
                      ) : null}
                      {group.disputedCount > 0 ? (
                        <span className="rounded-full bg-negative/10 px-2.5 py-1 text-xs font-semibold text-negative">
                          {group.disputedCount} disputed
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <h3 className="truncate text-xl font-semibold tracking-tight">{group.name}</h3>
                    <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </div>
                  <p className="text-xs text-muted-foreground">{group.members.length} people</p>
                  <p className="mt-4 text-sm text-muted-foreground">{balanceLabel(group.myNetPaise)}</p>
                  <p className={cn("money text-[2rem] leading-none", tone(group.myNetPaise))}>
                    {formatINR(Math.abs(group.myNetPaise))}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <AppSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create a group"
        description="You become the admin. Invite your roommates next."
        footer={
          <Button
            type="submit"
            form="create-group"
            size="xl"
            className="w-full"
            disabled={name.trim().length === 0}
            pending={creating.pending}
          >
            {creating.pending ? "Creating…" : "Create group"}
          </Button>
        }
      >
        <form id="create-group" onSubmit={create} className="space-y-2 pb-2">
          <label htmlFor="group-name" className="text-sm font-medium">
            Group name
          </label>
          <Input
            id="group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Flat 4B"
            autoComplete="off"
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
        </form>
      </AppSheet>

      <AppSheet
        open={joinOpen}
        onOpenChange={setJoinOpen}
        title="Join a group"
        description="Paste the code or invite link you were sent."
        footer={
          <Button
            type="submit"
            form="join-group"
            size="xl"
            className="w-full"
            disabled={code.trim().length < 4}
            pending={joining.pending}
          >
            {joining.pending ? "Joining…" : "Join group"}
          </Button>
        }
      >
        <form id="join-group" onSubmit={join} className="space-y-2 pb-2">
          <label htmlFor="join-code" className="text-sm font-medium">
            Invite code or link
          </label>
          <Input
            id="join-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="FLAT4B7K"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-12 rounded-[12px] px-3.5 text-base tracking-[0.12em]"
          />
        </form>
      </AppSheet>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: string
  tone: "positive" | "negative"
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-[16px] bg-card px-4 py-3.5 ring-1 ring-border">
      <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full",
            tone === "positive" ? "bg-positive/12 text-positive" : "bg-negative/10 text-negative",
          )}
        >
          {icon}
        </span>
        {label}
      </span>
      <p className={cn("money mt-1.5 text-2xl leading-none md:text-[1.75rem]", tone === "positive" ? "text-positive" : "text-negative")}>
        {value}
      </p>
    </div>
  )
}

function balanceLabel(net: number) {
  if (net > 0) return "You are owed"
  if (net < 0) return "You owe"
  return "Settled up"
}

function tone(net: number) {
  if (net > 0) return "text-positive"
  if (net < 0) return "text-negative"
  return "text-foreground"
}
