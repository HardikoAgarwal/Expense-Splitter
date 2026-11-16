"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { toast } from "sonner"

import { AppSheet } from "@/components/app-sheet"
import { Person, PersonStack } from "@/components/person"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createGroupAction, joinGroupAction } from "@/lib/actions"
import { formatINR } from "@/lib/money"
import { parseJoinCode } from "@/lib/messages"
import type { GroupCard, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"

export function GroupsHome({ user, groups }: { user: SessionUser; groups: GroupCard[] }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [pending, setPending] = useState(false)
  const router = useRouter()
  const reduce = useReducedMotion()
  const hour = new Date().getHours()
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const result = await createGroupAction(name)
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setCreateOpen(false)
    setName("")
    router.push(`/groups/${result.data}`)
    router.refresh()
  }

  async function join(event: React.FormEvent) {
    event.preventDefault()
    const parsed = parseJoinCode(code)
    if (!parsed) return
    setPending(true)
    const result = await joinGroupAction(parsed)
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.data.alreadyMember ? "You are already in" : "You joined")
    setJoinOpen(false)
    setCode("")
    router.push(`/groups/${result.data.groupId}`)
    router.refresh()
  }

  return (
    <div className="px-4">
      <header className="flex items-center justify-between pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Hissa</p>
        <Person id={user.id} name={user.displayName} />
      </header>
      <h1 suppressHydrationWarning className="text-[1.7rem] leading-tight font-semibold tracking-tight">
        {hello}, {user.displayName.split(" ")[0]}
      </h1>
      <div className="mt-6 flex items-center gap-3">
        <Button className="h-12 flex-1 rounded-[12px]" onClick={() => setCreateOpen(true)}>
          Create a group
        </Button>
        <button type="button" className="h-12 px-2 text-sm font-medium text-primary" onClick={() => setJoinOpen(true)}>
          Join
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {groups.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">No groups yet.</p>
        ) : (
          groups.map((group, index) => (
            <motion.div
              key={group.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.3 }}
            >
              <Link
                href={`/groups/${group.id}`}
                className="block rounded-[16px] bg-card p-5 ring-1 ring-border shadow-[0_16px_40px_-28px_rgba(40,30,10,0.7)] transition active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-3">
                  <PersonStack members={group.members} />
                  {group.pendingForMe > 0 ? (
                    <span className="rounded-full bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning">
                      {group.pendingForMe} to approve
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-4 text-xl font-semibold tracking-tight">{group.name}</h2>
                <p className="mt-3 text-sm text-muted-foreground">{balanceLabel(group.myNetPaise)}</p>
                <p className={cn("money text-[2rem] leading-none", tone(group.myNetPaise))}>
                  {formatINR(Math.abs(group.myNetPaise))}
                </p>
              </Link>
            </motion.div>
          ))
        )}
      </div>

      <AppSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create a group"
        description="You become the admin."
        footer={
          <Button type="submit" form="create-group" size="xl" className="w-full" disabled={pending || name.trim().length === 0}>
            {pending ? "Creating…" : "Create group"}
          </Button>
        }
      >
        <form id="create-group" onSubmit={(event) => void create(event)}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Flat 4B"
            className="h-12 rounded-[12px] px-3.5 text-base"
          />
        </form>
      </AppSheet>

      <AppSheet
        open={joinOpen}
        onOpenChange={setJoinOpen}
        title="Join a group"
        description="Code or invite link."
        footer={
          <Button type="submit" form="join-group" size="xl" className="w-full" disabled={pending || code.trim().length < 4}>
            {pending ? "Joining…" : "Join group"}
          </Button>
        }
      >
        <form id="join-group" onSubmit={(event) => void join(event)}>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="FLAT4B7K"
            autoCapitalize="characters"
            className="h-12 rounded-[12px] px-3.5 text-base tracking-[0.12em]"
          />
        </form>
      </AppSheet>
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
