"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, ChevronRightIcon, LockIcon, SettingsIcon, Share2Icon } from "lucide-react"
import { toast } from "sonner"

import { AppSheet } from "@/components/app-sheet"
import { CategoryIcon } from "@/components/category-icon"
import { ExpenseDetail } from "@/components/expense-detail"
import { Notice } from "@/components/notice"
import { Person, PersonStack } from "@/components/person"
import { ShowList } from "@/components/show-list"
import { ShareActions } from "@/components/share-actions"
import { useExpense } from "@/components/shell"
import { Input } from "@/components/ui/input"
import {
  createInviteAction,
  deleteGroupAction,
  promoteMemberAction,
  regenerateInviteAction,
  removeMemberAction,
  renameGroupAction,
  revokeInvitesAction,
} from "@/lib/actions"
import { categoryLabel } from "@/lib/categories"
import { formatDay, formatINR, formatMonth, monthStartISO, todayISO } from "@/lib/money"
import { appBaseUrl, groupInviteMessage } from "@/lib/messages"
import type { Debt, GroupDetail, Member, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"

export function GroupScreen({ group, user }: { group: GroupDetail; user: SessionUser }) {
  const { openExpense } = useExpense()
  const router = useRouter()
  const [tab, setTab] = useState<"expenses" | "balances">("expenses")
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [inviting, setInviting] = useState(false)
  const [groupName, setGroupName] = useState(group.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isAdmin = group.myRole === "admin"
  const adminCount = group.members.filter((member) => member.role === "admin").length
  const month = monthStartISO(todayISO())
  const monthTotal = group.expenses
    .filter((expense) => expense.expenseDate.startsWith(month.slice(0, 7)))
    .reduce((sum, expense) => sum + expense.amountPaise, 0)

  async function invitePeople() {
    setInviteOpen(true)
    if (invite) return
    setInviting(true)
    const result = await createInviteAction(group.id)
    setInviting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setInvite(result.data)
  }

  async function refreshInvite(regenerate = false) {
    setInviting(true)
    const result = regenerate ? await regenerateInviteAction(group.id) : await createInviteAction(group.id)
    setInviting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setInvite(result.data)
  }

  async function revokeInvite() {
    const result = await revokeInvitesAction(group.id)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setInvite(null)
    toast.success("Invite revoked")
  }

  const inviteText = invite
    ? groupInviteMessage({ group: group.name, appUrl: appBaseUrl(), code: invite.code })
    : ""

  async function promote(member: Member) {
    const result = await promoteMemberAction(group.id, member.id)
    if (!result.ok) toast.error(result.error)
    else {
      toast.success(`${member.displayName.split(" ")[0]} is now an admin`)
      router.refresh()
    }
  }

  async function removePerson(member: Member) {
    const result = await removeMemberAction(group.id, member.id)
    if (!result.ok) toast.error(result.error)
    else {
      toast.success("Removed")
      router.refresh()
    }
  }

  async function removeGroup() {
    const result = await deleteGroupAction(group.id)
    if (!result.ok) toast.error(result.error)
    else router.push("/groups")
  }

  return (
    <div>
      <header className="sticky top-0 z-20 bg-background/55 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <Link href="/groups" className="flex size-11 items-center justify-center rounded-[12px] active:bg-muted">
            <ArrowLeftIcon className="size-5" />
            <span className="sr-only">Groups</span>
          </Link>
          <div className="flex items-center">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="flex size-11 items-center justify-center rounded-[12px] active:bg-muted"
              >
                <SettingsIcon className="size-5" />
                <span className="sr-only">Group settings</span>
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void invitePeople()}
                className="flex size-11 items-center justify-center rounded-[12px] active:bg-muted"
              >
                <Share2Icon className="size-5" />
                <span className="sr-only">Invite</span>
              </button>
            ) : null}
          </div>
        </div>
        <h1 className="mt-1 text-[1.75rem] font-semibold tracking-tight">{group.name}</h1>
        <div className="mt-3 flex items-center gap-2">
          <PersonStack members={group.members} />
          <p className="truncate text-sm text-muted-foreground">
            {group.members.map((member) => member.displayName.split(" ")[0]).join(", ")}
          </p>
        </div>
      </header>

      <div className="space-y-6 px-4">
        {group.expenses.some((expense) => expense.disputed) ? (
          <Notice tone="warning" title={`${group.expenses.filter((expense) => expense.disputed).length} disputed`}>
            Still counted in balances.
          </Notice>
        ) : null}
        <BalanceHero group={group} userId={user.id} />
        <Link
          href={`/groups/${group.id}/summary`}
          className="flex items-center justify-between rounded-[16px] bg-card px-4 py-3.5 ring-1 ring-border"
        >
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{formatMonth(month)}</p>
            <p className="mt-0.5 font-medium">Group spent {formatINR(monthTotal)}</p>
          </div>
          <ChevronRightIcon className="size-5 text-muted-foreground" />
        </Link>

        <div className="grid grid-cols-2 rounded-[12px] bg-muted p-1">
          {(["expenses", "balances"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "h-11 rounded-[12px] text-sm font-semibold capitalize",
                tab === value ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>

        {tab === "expenses" ? (
          <ExpenseList group={group} userId={user.id} onOpen={(expense) => setOpenExpenseId(expense.id)} />
        ) : (
          <BalanceList group={group} userId={user.id} />
        )}
      </div>

      <ExpenseDetail
        expense={group.expenses.find((expense) => expense.id === openExpenseId) ?? null}
        group={group}
        user={user}
        onClose={() => setOpenExpenseId(null)}
        onEdit={(expense) => {
          setOpenExpenseId(null)
          openExpense(group.id, expense)
        }}
      />

      <AppSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={`Invite to ${group.name}`}
        description="Expires in 7 days."
        footer={inviteText ? <ShareActions title={`Join ${group.name} on Hissa`} text={inviteText} /> : null}
      >
        <div className="space-y-4 pb-2">
          <p className="money text-center text-4xl tracking-[0.12em]">{inviting ? "····" : invite?.code}</p>
          {inviteText ? <p className="rounded-[12px] bg-muted p-3 text-sm leading-6">{inviteText}</p> : null}
          <div className="flex justify-center gap-4">
            <button type="button" className="text-sm font-medium text-primary" disabled={inviting} onClick={() => void refreshInvite(true)}>
              New code
            </button>
            <button type="button" className="text-sm font-medium text-muted-foreground" disabled={!invite} onClick={() => void revokeInvite()}>
              Revoke
            </button>
          </div>
        </div>
      </AppSheet>

      <AppSheet open={manageOpen} onOpenChange={setManageOpen} title="Group settings">
        <div className="space-y-6 pb-4">
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void renameGroupAction(group.id, groupName).then((result) => {
                  if (!result.ok) toast.error(result.error)
                  else {
                    toast.success("Name updated")
                    router.refresh()
                  }
                })
              }}
            >
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="h-12 rounded-[12px] px-3.5 text-base"
              />
              <button type="submit" className="text-sm font-medium text-primary">
                Rename
              </button>
            </form>
            <div className="space-y-3">
              <h3 className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Participants</h3>
              {group.members.map((member) => (
                <div key={member.id} className="flex items-center gap-3">
                  <Person id={member.id} name={member.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.displayName}</p>
                    <p className="text-xs text-muted-foreground">{member.role === "admin" ? "Admin" : "Member"}</p>
                  </div>
                  {member.role !== "admin" ? (
                    <button type="button" className="text-xs font-semibold text-primary" onClick={() => void promote(member)}>
                      Promote
                    </button>
                  ) : null}
                  {member.role === "admin" && adminCount <= 1 ? null : (
                    <button type="button" className="text-xs font-semibold text-negative" onClick={() => void removePerson(member)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {confirmDelete ? (
              <button type="button" className="text-sm font-medium text-negative" onClick={() => void removeGroup()}>
                Confirm delete
              </button>
            ) : (
              <button type="button" className="text-sm font-medium text-negative" onClick={() => setConfirmDelete(true)}>
                Delete group
              </button>
            )}
        </div>
      </AppSheet>
    </div>
  )
}

function BalanceHero({ group, userId }: { group: GroupDetail; userId: string }) {
  const net = group.myNetPaise
  const positive = net > 0
  const negative = net < 0
  const mine = debtsInvolving(group.debts, userId, group.members)
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[16px] px-5 py-5 text-white",
        negative ? "gradient-hero-owe" : "gradient-hero",
      )}
    >
      <p className="text-sm text-white/75">{positive ? "You are owed" : negative ? "You owe" : "All settled"}</p>
      <p className="money mt-2 text-[2.7rem] leading-none">{formatINR(Math.abs(net))}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0 text-sm text-white/85">
          {mine.length === 0 ? (
            <p>Nothing to settle right now.</p>
          ) : (
            mine.slice(0, 2).map((line) => <p key={line}>{line}</p>)
          )}
        </div>
        <Link
          href={`/groups/${group.id}/settle`}
          className="shrink-0 rounded-full bg-white/15 px-3.5 py-2 text-sm font-semibold backdrop-blur-sm"
        >
          Settle up
        </Link>
      </div>
    </section>
  )
}

function ExpenseList({
  group,
  userId,
  onOpen,
}: {
  group: GroupDetail
  userId: string
  onOpen: (expense: GroupDetail["expenses"][number]) => void
}) {
  if (group.expenses.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted-foreground">No expenses yet.</p>
    )
  }
  return (
    <div className="space-y-2">
      <ShowList
        items={group.expenses}
        render={(expense) => {
          const index = group.expenses.indexOf(expense)
        const month = formatMonth(expense.expenseDate)
        const previous = index > 0 ? formatMonth(group.expenses[index - 1].expenseDate) : ""
        const showMonth = month !== previous
        const mine = expense.shares.find((share) => share.userId === userId)?.sharePaise ?? 0
        const payer = group.members.find((member) => member.id === expense.payerId)?.displayName ?? "Someone"
        return (
          <div key={expense.id}>
            {showMonth ? <p className="px-1 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{month}</p> : null}
            <button
              type="button"
              onClick={() => onOpen(expense)}
              className="flex w-full items-center gap-3 rounded-[16px] bg-card px-3 py-3 text-left ring-1 ring-border active:bg-muted"
            >
              <CategoryIcon category={expense.category} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{expense.description}</span>
                  {expense.disputed ? (
                    <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      Disputed
                    </span>
                  ) : null}
                  {expense.locked ? <LockIcon className="size-3.5 text-muted-foreground" /> : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {payer.split(" ")[0]} paid · {formatDay(expense.expenseDate)} · {categoryLabel(expense.category)}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-semibold">{formatINR(expense.amountPaise)}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {mine > 0 ? `you ${formatINR(mine)}` : "not in this split"}
                </span>
              </span>
            </button>
          </div>
        )
        }}
      />
    </div>
  )
}

function BalanceList({ group, userId }: { group: GroupDetail; userId: string }) {
  return (
    <div className="space-y-5">
      <section className="rounded-[16px] bg-card p-4 ring-1 ring-border">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Who pays whom</h2>
        {group.debts.length === 0 ? (
          <p className="mt-3 text-sm">Everyone is square.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {group.debts.map((debt) => (
              <li key={`${debt.fromUserId}-${debt.toUserId}`} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{phrase(debt, userId, group.members)}</span>
                <span className={cn("money text-lg", debt.toUserId === userId ? "text-positive" : debt.fromUserId === userId ? "text-negative" : "")}>
                  {formatINR(debt.amountPaise)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        {group.balances.map((balance) => {
          const member = group.members.find((item) => item.id === balance.userId)
          return (
            <div key={balance.userId} className="rounded-[16px] bg-card px-4 py-3 ring-1 ring-border">
              <div className="flex items-center gap-3">
                <Person id={balance.userId} name={member?.displayName ?? "Someone"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{balance.userId === userId ? "You" : member?.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    Paid {formatINR(balance.paidPaise)} · Share {formatINR(balance.owedPaise)}
                  </p>
                </div>
                <p className={cn("money text-lg", tone(balance.netPaise))}>{formatINR(balance.netPaise, { signed: true })}</p>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

function debtsInvolving(debts: Debt[], userId: string, members: Member[]) {
  return debts
    .filter((debt) => debt.fromUserId === userId || debt.toUserId === userId)
    .map((debt) => phrase(debt, userId, members))
}

function phrase(debt: Debt, userId: string, members: Member[]) {
  const name = (id: string) => members.find((member) => member.id === id)?.displayName.split(" ")[0] ?? "Someone"
  if (debt.fromUserId === userId) return `You pay ${name(debt.toUserId)}`
  if (debt.toUserId === userId) return `${name(debt.fromUserId)} pays you`
  return `${name(debt.fromUserId)} pays ${name(debt.toUserId)}`
}

function tone(net: number) {
  if (net > 0) return "text-positive"
  if (net < 0) return "text-negative"
  return "text-muted-foreground"
}
