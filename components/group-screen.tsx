"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronRightIcon, LockIcon, PlusIcon, SettingsIcon, Share2Icon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { BackLink } from "@/components/back-link"
import { CategoryIcon } from "@/components/category-icon"
import { ExpenseDetail } from "@/components/expense-detail"
import { ExpenseFilterBar } from "@/components/expense-filters"
import { Person, PersonStack } from "@/components/person"
import { ShowList } from "@/components/show-list"
import { MessagePreview, ShareActions } from "@/components/share-actions"
import { useExpense, useRegisterGroup } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FIELD, FIELD_LABEL, SECTION_TITLE } from "@/components/field"
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
import { disputeChip, disputeNeedsMe } from "@/lib/disputes"
import { EMPTY_FILTERS, filterExpenses, type ExpenseFilters } from "@/lib/expense-filters"
import { formatDay, formatINR, formatMonth, monthStartISO, todayISO } from "@/lib/money"
import { appBaseUrl, groupInviteMessage } from "@/lib/messages"
import type { Debt, GroupDetail, Member, SessionUser } from "@/lib/types"
import { useAction } from "@/lib/use-action"
import { cn } from "@/lib/utils"

export function GroupScreen({ group, user }: { group: GroupDetail; user: SessionUser }) {
  const { openExpense } = useExpense()
  useRegisterGroup(group)
  const [tab, setTab] = useState<"expenses" | "balances">("expenses")
  const [filters, setFilters] = useState<ExpenseFilters>(EMPTY_FILTERS)
  const visible = filterExpenses(group.expenses, filters)
  const searchParams = useSearchParams()
  const router = useRouter()
  // Links from Activity: ?expense=<id> opens the detail, ?edit=<id> opens the edit sheet.
  const [openExpenseId, setOpenExpenseId] = useState<string | null>(() => searchParams.get("expense"))
  const editId = searchParams.get("edit")
  const linked = Boolean(editId || searchParams.get("expense"))
  useEffect(() => {
    if (!linked) return
    router.replace(`/groups/${group.id}`, { scroll: false })
    const target = editId ? group.expenses.find((expense) => expense.id === editId) : null
    if (target && target.createdBy === user.id && !target.locked) openExpense(group.id, target)
  }, [linked, editId, group, user.id, router, openExpense])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [groupName, setGroupName] = useState(group.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inviting = useAction()
  const managing = useAction()
  const isAdmin = group.myRole === "admin"
  const adminCount = group.members.filter((member) => member.role === "admin").length
  const month = monthStartISO(todayISO())
  const monthTotal = group.expenses
    .filter((expense) => expense.expenseDate.startsWith(month.slice(0, 7)))
    .reduce((sum, expense) => sum + expense.amountPaise, 0)

  function invitePeople() {
    setInviteOpen(true)
    if (invite) return
    inviting.run(() => createInviteAction(group.id), { onSuccess: setInvite })
  }

  function newCode() {
    inviting.run(() => regenerateInviteAction(group.id), { onSuccess: setInvite, success: "New code ready" })
  }

  function revokeInvite() {
    inviting.run(() => revokeInvitesAction(group.id), {
      success: "Invite revoked",
      onSuccess: () => setInvite(null),
    })
  }

  const inviteText = invite
    ? groupInviteMessage({ group: group.name, appUrl: appBaseUrl(), code: invite.code })
    : ""

  function promote(member: Member) {
    managing.run(() => promoteMemberAction(group.id, member.id), {
      success: `${member.displayName.split(" ")[0]} is now an admin`,
    })
  }

  function removePerson(member: Member) {
    managing.run(() => removeMemberAction(group.id, member.id), { success: "Removed" })
  }

  function rename(event: React.FormEvent) {
    event.preventDefault()
    managing.run(() => renameGroupAction(group.id, groupName), { success: "Name updated" })
  }

  function removeGroup() {
    managing.run(() => deleteGroupAction(group.id), {
      navigate: "/groups",
      replace: true,
      success: "Group deleted",
    })
  }

  const summaryLink = (
    <Link
      href={`/groups/${group.id}/summary`}
      className="flex items-center justify-between rounded-[16px] bg-card px-4 py-3.5 ring-1 ring-border transition hover:ring-primary/30"
    >
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{formatMonth(month)}</p>
        <p className="mt-0.5 font-medium">Group spent {formatINR(monthTotal)}</p>
      </div>
      <ChevronRightIcon className="size-5 text-muted-foreground" />
    </Link>
  )

  return (
    <div>
      <header className="sticky top-[var(--app-bar-height)] z-20 bg-background/70 px-4 pt-3 pb-3 backdrop-blur-xl md:static md:top-auto md:bg-transparent md:px-0 md:pt-6 md:pb-6 md:backdrop-blur-none">
        <div className="mb-3 hidden md:block">
          <BackLink href="/groups" label="Groups" className="mb-0" />
        </div>
        <div className="md:flex md:items-end md:justify-between md:gap-6">
          <div className="flex min-w-0 items-center justify-between gap-3 md:justify-start md:gap-4">
            <h1 className="min-w-0 truncate text-[1.75rem] font-semibold tracking-tight md:text-[2.1rem]">{group.name}</h1>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setMembersOpen(true)}
                aria-label={`${group.members.length} members. Show list`}
                aria-haspopup="dialog"
                className="rounded-full p-0.5 transition hover:bg-muted active:scale-[0.98]"
              >
                <PersonStack members={group.members} max={4} size="sm" />
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setManageOpen(true)}
                  className="flex size-10 items-center justify-center rounded-[12px] md:hidden active:bg-muted"
                >
                  <SettingsIcon className="size-5" />
                  <span className="sr-only">Group settings</span>
                </button>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  onClick={invitePeople}
                  className="flex size-10 items-center justify-center rounded-[12px] md:hidden active:bg-muted"
                >
                  <Share2Icon className="size-5" />
                  <span className="sr-only">Invite</span>
                </button>
              ) : null}
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            {isAdmin ? (
              <Button variant="ghost" size="lg" onClick={() => setManageOpen(true)} aria-label="Group settings">
                <SettingsIcon />
              </Button>
            ) : null}
            {isAdmin ? (
              <Button variant="outline" size="lg" onClick={invitePeople}>
                <Share2Icon /> Invite
              </Button>
            ) : null}
            <Button variant="outline" size="lg" render={<Link href={`/groups/${group.id}/settle`} />} nativeButton={false}>
              Settle up
            </Button>
            <Button size="lg" onClick={() => openExpense(group.id)}>
              <PlusIcon /> Add expense
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 md:px-0 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start lg:gap-8">
        <div className="space-y-6">
          <div className="space-y-6 lg:hidden">
            <BalanceHero group={group} userId={user.id} />
            {summaryLink}
          </div>

          <div role="tablist" aria-label="Group view" className="grid grid-cols-2 rounded-[12px] bg-muted p-1 lg:hidden">
            {(["expenses", "balances"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "h-11 rounded-[12px] text-sm font-semibold capitalize transition",
                  tab === value ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <section className={cn(tab !== "expenses" && "hidden lg:block")} aria-labelledby="expenses-heading">
            <div className="mb-3 hidden items-baseline justify-between lg:flex">
              <h2 id="expenses-heading" className={SECTION_TITLE}>
                Expenses · {group.expenses.length}
              </h2>
            </div>
            {group.expenses.length > 0 ? (
              <div className="mb-6">
                <ExpenseFilterBar
                  filters={filters}
                  onChange={setFilters}
                  members={group.members}
                  userId={user.id}
                  total={group.expenses.length}
                  shown={visible.length}
                />
              </div>
            ) : null}
            <ExpenseList
              group={group}
              expenses={visible}
              userId={user.id}
              onOpen={(expense) => setOpenExpenseId(expense.id)}
              onAdd={() => openExpense(group.id)}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          </section>

          <div className={cn("lg:hidden", tab !== "balances" && "hidden")}>
            <BalanceList group={group} userId={user.id} />
          </div>
        </div>

        <aside className="hidden space-y-5 lg:sticky lg:top-6 lg:block" aria-label="Balances">
          <BalanceHero group={group} userId={user.id} />
          {summaryLink}
          <BalanceList group={group} userId={user.id} />
        </aside>
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
        description="Send this to your roommates. The code works for 7 days."
        footer={inviteText ? <ShareActions title={`Join ${group.name} on Hissa`} text={inviteText} /> : null}
      >
        <div className="space-y-4 pb-2" aria-busy={inviting.pending}>
          <div className="gradient-hero rounded-[16px] px-4 py-4 text-center">
            <p className="text-xs font-medium tracking-[0.16em] text-white/70 uppercase">Invite code</p>
            <p className="money mt-1 text-4xl tracking-[0.14em] text-white" aria-live="polite">
              {inviting.pending && !invite ? "····" : invite?.code}
            </p>
          </div>
          {inviteText ? <MessagePreview title={`Join ${group.name} on Hissa`} text={inviteText} /> : null}
          <div className="flex justify-center gap-2">
            <Button variant="ghost" size="sm" className="text-primary" pending={inviting.pending} onClick={newCode}>
              New code
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={!invite || inviting.pending} onClick={revokeInvite}>
              Revoke
            </Button>
          </div>
        </div>
      </AppSheet>

      <AppSheet
        open={membersOpen}
        onOpenChange={setMembersOpen}
        title="Members"
        description={`${group.members.length} ${group.members.length === 1 ? "person" : "people"} in ${group.name}`}
      >
        <ul className="divide-y pb-2">
          {group.members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 py-3">
              <Person id={member.id} name={member.displayName} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {member.displayName}
                  {member.id === user.id ? <span className="ml-1.5 text-sm font-normal text-muted-foreground">(You)</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              {member.role === "admin" ? (
                <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">Admin</span>
              ) : null}
            </li>
          ))}
        </ul>
      </AppSheet>

      <AppSheet open={manageOpen} onOpenChange={setManageOpen} title="Group settings">
        <div className="space-y-6 pb-4">
          <form className={FIELD} onSubmit={rename}>
            <label htmlFor="group-rename" className={FIELD_LABEL}>
              Group name
            </label>
            <div className="flex gap-2">
              <Input
                id="group-rename"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="h-11 flex-1 rounded-[12px] px-3.5 text-base"
              />
              <Button
                type="submit"
                variant="outline"
                size="lg"
                disabled={groupName.trim() === group.name || groupName.trim().length === 0}
                pending={managing.pending}
              >
                Rename
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            <h3 className={SECTION_TITLE}>Participants</h3>
            {group.members.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Person id={member.id} name={member.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member.displayName}</p>
                  <p className="text-xs text-muted-foreground">{member.role === "admin" ? "Admin" : "Member"}</p>
                </div>
                {member.role !== "admin" ? (
                  <Button variant="ghost" size="sm" className="text-primary" disabled={managing.pending} onClick={() => promote(member)}>
                    Promote
                  </Button>
                ) : null}
                {member.role === "admin" && adminCount <= 1 ? null : (
                  <Button variant="ghost" size="sm" className="text-negative" disabled={managing.pending} onClick={() => removePerson(member)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
          {confirmDelete ? (
            <div className="space-y-2 rounded-[12px] bg-negative/8 p-3">
              <p className="text-sm">Delete {group.name} and all its expenses? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="outline" size="lg" className="flex-1" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
                <Button variant="destructive" size="lg" className="flex-1" pending={managing.pending} onClick={removeGroup}>
                  Delete group
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="lg" className="text-negative" onClick={() => setConfirmDelete(true)}>
              Delete group
            </Button>
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
  expenses,
  userId,
  onOpen,
  onAdd,
  onClearFilters,
}: {
  group: GroupDetail
  expenses: GroupDetail["expenses"]
  userId: string
  onOpen: (expense: GroupDetail["expenses"][number]) => void
  onAdd: () => void
  onClearFilters: () => void
}) {
  if (group.expenses.length > 0 && expenses.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[16px] bg-card px-6 py-10 text-center ring-1 ring-border">
        <p className="font-semibold">No expenses match</p>
        <p className="mt-1 text-sm text-muted-foreground">Try a different search or remove a filter.</p>
        <Button variant="outline" size="lg" className="mt-4" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    )
  }
  if (group.expenses.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[16px] bg-card px-6 py-10 text-center ring-1 ring-border">
        <p className="font-semibold">No expenses yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">Add rent, groceries or bills and Hissa works out who owes whom.</p>
        <Button size="lg" className="mt-5" onClick={onAdd}>
          <PlusIcon /> Add the first expense
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <ShowList
        items={expenses}
        render={(expense) => {
          const index = expenses.indexOf(expense)
        const month = formatMonth(expense.expenseDate)
        const previous = index > 0 ? formatMonth(expenses[index - 1].expenseDate) : ""
        const showMonth = month !== previous
        const mine = expense.shares.find((share) => share.userId === userId)?.sharePaise ?? 0
        const payer = group.members.find((member) => member.id === expense.payerId)?.displayName ?? "Someone"
        return (
          <div key={expense.id}>
            {showMonth ? (
              <h3
                className={cn(
                  "flex items-baseline justify-between gap-3 px-1 pb-3",
                  index === 0 ? "pt-0" : "pt-6",
                )}
              >
                <span className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{month}</span>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {formatINR(
                    expenses
                      .filter((item) => formatMonth(item.expenseDate) === month)
                      .reduce((sum, item) => sum + item.amountPaise, 0),
                  )}
                </span>
              </h3>
            ) : null}
            <button
              type="button"
              onClick={() => onOpen(expense)}
              className="flex w-full items-center gap-3 rounded-[16px] bg-card px-3 py-3 text-left ring-1 ring-border transition hover:ring-primary/30 active:bg-muted md:px-4"
            >
              <CategoryIcon category={expense.category} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{expense.description}</span>
                  {expense.disputed ? (
                    <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
                      {disputeChip(
                        expense.flags.find((flag) => disputeNeedsMe(flag, expense, userId)) ?? expense.flags[0],
                        userId,
                        (id) => group.members.find((member) => member.id === id)?.displayName ?? "them",
                      )}
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
        <h2 className={SECTION_TITLE}>Who pays whom</h2>
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
