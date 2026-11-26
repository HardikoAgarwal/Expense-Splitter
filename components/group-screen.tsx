"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronRightIcon, LockIcon, LogOutIcon, PlusIcon, Trash2Icon, SettingsIcon, Share2Icon } from "lucide-react"

import { AppSheet } from "@/components/app-sheet"
import { BackLink } from "@/components/back-link"
import { CategoryIcon } from "@/components/category-icon"
import { ExpenseDetail } from "@/components/expense-detail"
import { ExitGroupSheet } from "@/components/leave-group"
import { ExpenseFilterBar } from "@/components/expense-filters"
import { Person, PersonStack } from "@/components/person"
import { ShowList } from "@/components/show-list"
import { CopyIconButton, PlainMessage, ShareActions } from "@/components/share-actions"
import { StickySubhead, useExpense, useRegisterGroup } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FIELD, FIELD_LABEL, SECTION_TITLE } from "@/components/field"
import {
  createInviteAction,
  deleteGroupAction,
  demoteMemberAction,
  promoteMemberAction,
  regenerateInviteAction,
  renameGroupAction,
  revokeInvitesAction,
} from "@/lib/actions"
import { categoryLabel } from "@/lib/categories"
import { disputeChip, disputeNeedsMe } from "@/lib/disputes"
import { EMPTY_FILTERS, filterExpenses, type ExpenseFilters } from "@/lib/expense-filters"
import { canModifyExpense } from "@/lib/expense-access"
import { memberNameIn } from "@/lib/members"
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
    if (target && canModifyExpense(target, user.id, { creatorLeft: target.creatorLeft, isGroupAdmin: group.myRole === "admin" }) && !target.locked && !target.leftMember) openExpense(group.id, target)
  }, [linked, editId, group, user.id, router, openExpense])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [roleChange, setRoleChange] = useState<{ member: Member; to: "admin" | "member" } | null>(null)
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null)
  const [groupName, setGroupName] = useState(group.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteName, setDeleteName] = useState("")
  const [exitTarget, setExitTarget] = useState<Member | null>(null)
  const inviting = useAction()
  const managing = useAction()
  const isAdmin = group.myRole === "admin"
  const owing = group.balances.filter((balance) => balance.netPaise !== 0)
  const adminCount = group.members.filter((member) => member.role === "admin").length
  const selfMember = group.members.find((member) => member.id === user.id) ?? null
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

  function changeRole() {
    if (!roleChange) return
    const { member, to } = roleChange
    const first = member.displayName.split(" ")[0]
    const self = member.id === user.id
    managing.run(
      () => (to === "admin" ? promoteMemberAction(group.id, member.id) : demoteMemberAction(group.id, member.id)),
      {
        success: to === "admin" ? `${first} is now an admin` : self ? "You are now a member" : `${first} is now a member`,
        onSuccess: () => setRoleChange(null),
      },
    )
  }

  function startExit(member: Member) {
    setManageOpen(false)
    setExitTarget(member)
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
      className="flex items-end justify-between gap-3 rounded-[16px] bg-card px-4 py-4 ring-1 ring-border transition hover:ring-primary/30 active:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {formatMonth(month)} · group spent
        </p>
        <p className="money mt-2 text-[2rem] leading-none tracking-tight">{formatINR(monthTotal)}</p>
        <p className="mt-2.5 text-xs font-medium text-primary">Tap to view summary</p>
      </div>
      <ChevronRightIcon className="mb-0.5 size-5 shrink-0 text-muted-foreground" />
    </Link>
  )

  return (
    <div>
      <StickySubhead>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[1.75rem] leading-tight font-semibold tracking-tight">{group.name}</h1>
            <MembersPill group={group} onClick={() => setManageOpen(true)} className="mt-1" />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                className="flex size-10 items-center justify-center rounded-[12px] active:bg-muted"
              >
                <SettingsIcon className="size-5" />
                <span className="sr-only">Group settings</span>
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                onClick={invitePeople}
                className="flex size-10 items-center justify-center rounded-[12px] active:bg-muted"
              >
                <Share2Icon className="size-5" />
                <span className="sr-only">Invite</span>
              </button>
            ) : null}
          </div>
        </div>
      </StickySubhead>

      <header className="hidden px-0 pt-6 pb-6 md:block">
        <div className="mb-3">
          <BackLink href="/groups" label="Groups" className="mb-0" />
        </div>
        <div className="flex items-end justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <h1 className="min-w-0 truncate text-[2.1rem] font-semibold tracking-tight">{group.name}</h1>
            <MembersPill group={group} onClick={() => setManageOpen(true)} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
        <div className="space-y-6 pb-2" aria-busy={inviting.pending}>
          <section className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Share this code</p>
            <div className="gradient-hero rounded-[16px] px-4 pt-5 pb-3">
              <div className="flex items-center justify-center gap-2 pl-10">
                <p className="money text-4xl tracking-[0.14em] text-white" aria-live="polite">
                  {inviting.pending && !invite ? "····" : invite?.code}
                </p>
                {invite ? (
                  <CopyIconButton text={invite.code} label="Copy code" className="text-white/80 hover:bg-white/15 hover:text-white" />
                ) : (
                  <span className="size-10" aria-hidden />
                )}
              </div>
              <div className="mt-2 flex items-center justify-center gap-1 text-sm">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 font-medium text-white/85 hover:text-white disabled:opacity-50"
                  disabled={inviting.pending}
                  onClick={newCode}
                >
                  New code
                </button>
                <span className="text-white/40" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 font-medium text-white/60 hover:text-white disabled:opacity-50"
                  disabled={!invite || inviting.pending}
                  onClick={revokeInvite}
                >
                  Revoke
                </button>
              </div>
            </div>
          </section>
          {inviteText ? (
            <section className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Or share this message</p>
              <PlainMessage text={inviteText} />
            </section>
          ) : null}
        </div>
      </AppSheet>

      <ExitGroupSheet group={group} viewerId={user.id} target={exitTarget} onClose={() => setExitTarget(null)} />

      <AppSheet
        open={manageOpen}
        onOpenChange={setManageOpen}
        title={isAdmin ? "Group settings" : group.name}
        description={`${group.members.length} ${group.members.length === 1 ? "person" : "people"} in ${group.name}`}
        footer={
          selfMember ? (
            <Button
              variant="outline"
              size="xl"
              className="w-full text-negative hover:text-negative"
              onClick={() => startExit(selfMember)}
            >
              <LogOutIcon />
              Leave group
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-6 pb-4">
          {isAdmin ? (
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
          ) : null}
          <div className="space-y-3">
            <h3 className={SECTION_TITLE}>Members</h3>
            {group.members.map((member) => {
              const net = group.balances.find((balance) => balance.userId === member.id)?.netPaise ?? 0
              return (
                <div key={member.id} className="flex items-center gap-3">
                  <Person id={member.id} name={member.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.displayName}
                      {member.id === user.id ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(You)</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.role === "admin" ? "Admin" : "Member"} ·{" "}
                      <span className={cn(net < 0 && "text-negative", net > 0 && "text-positive")}>
                        {net === 0 ? "Settled up" : net < 0 ? `Owes ${formatINR(-net)}` : `Is owed ${formatINR(net)}`}
                      </span>
                    </p>
                  </div>
                  {isAdmin ? (
                    <div className="flex shrink-0 items-center">
                      {member.role !== "admin" ? (
                        <Button variant="ghost" size="sm" className="text-primary" disabled={managing.pending} onClick={() => setRoleChange({ member, to: "admin" })}>
                          Make admin
                        </Button>
                      ) : adminCount > 1 ? (
                        <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={managing.pending} onClick={() => setRoleChange({ member, to: "member" })}>
                          Remove admin
                        </Button>
                      ) : null}
                      {member.id !== user.id ? (
                        <Button variant="ghost" size="sm" className="text-negative" disabled={managing.pending} onClick={() => startExit(member)}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          {group.formerMembers.length > 0 ? (
            <div className="space-y-2">
              <h3 className={SECTION_TITLE}>Left the group</h3>
              <ul className="space-y-2">
                {group.formerMembers.map((member) => (
                  <li key={member.id} className="flex items-center gap-3 opacity-70">
                    <Person id={member.id} name={member.displayName} />
                    <p className="min-w-0 flex-1 truncate text-sm">{member.displayName}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isAdmin ? (
          <div className="space-y-3 border-t pt-5">
            <h3 className={SECTION_TITLE}>Danger zone</h3>
            {confirmDelete ? (
              <div className="space-y-3 rounded-[12px] bg-negative/8 p-3.5">
                <p className="text-sm font-medium">Delete {group.name} for everyone?</p>
                <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                  <li>
                    {group.expenses.length} {group.expenses.length === 1 ? "expense" : "expenses"} and all payment history
                    are erased for all {group.members.length} members.
                  </li>
                  {owing.length > 0 ? (
                    <li className="text-negative">
                      {owing.length} {owing.length === 1 ? "person has" : "people have"} unsettled balances. Settle up first
                      if you still need them.
                    </li>
                  ) : null}
                  <li>This cannot be undone.</li>
                </ul>
                <div className={FIELD}>
                  <label htmlFor="group-delete-confirm" className={FIELD_LABEL}>
                    Type <span className="font-semibold text-foreground">{group.name}</span> to confirm
                  </label>
                  <Input
                    id="group-delete-confirm"
                    value={deleteName}
                    onChange={(event) => setDeleteName(event.target.value)}
                    autoComplete="off"
                    className="h-11 rounded-[12px] px-3.5 text-base"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1"
                    onClick={() => {
                      setConfirmDelete(false)
                      setDeleteName("")
                    }}
                  >
                    Keep it
                  </Button>
                  <Button
                    variant="destructive"
                    size="lg"
                    className="flex-1"
                    pending={managing.pending}
                    disabled={deleteName.trim() !== group.name.trim()}
                    onClick={removeGroup}
                  >
                    Delete group
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Permanently remove this group and everything in it. Only admins can do this.
                </p>
                <Button variant="outline" size="lg" className="text-negative" onClick={() => setConfirmDelete(true)}>
                  <Trash2Icon /> Delete group
                </Button>
              </>
            )}
          </div>
          ) : null}
        </div>
      </AppSheet>

      <Dialog open={roleChange !== null} onOpenChange={(open) => !open && setRoleChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {roleChange?.to === "admin"
                ? `Make ${roleChange.member.displayName.split(" ")[0]} an admin?`
                : roleChange?.member.id === user.id
                  ? "Step down as admin?"
                  : `Remove ${roleChange?.member.displayName.split(" ")[0]} as admin?`}
            </DialogTitle>
            <DialogDescription>
              {roleChange?.to === "admin"
                ? "Admins can invite and remove people, rename or delete the group, and edit expenses added by people who left."
                : "They stay in the group as a regular member and lose all admin controls."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-transparent">
            <Button type="button" variant="outline" className="h-11 rounded-[12px]" onClick={() => setRoleChange(null)}>
              Cancel
            </Button>
            <Button type="button" className="h-11 rounded-[12px]" pending={managing.pending} onClick={changeRole}>
              {roleChange?.to === "admin" ? "Make admin" : "Remove admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The people in this group, as a tappable chip that opens the members list. */
function MembersPill({ group, onClick, className }: { group: GroupDetail; onClick: () => void; className?: string }) {
  const count = group.members.length
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${count} ${count === 1 ? "member" : "members"}. Show list`}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full bg-muted/60 py-0.5 pr-2.5 pl-1 text-xs font-medium text-muted-foreground ring-1 ring-border transition hover:bg-muted hover:text-foreground active:scale-[0.98]",
        className,
      )}
    >
      <PersonStack members={group.members} max={3} size="xs" />
      <span>
        {count} {count === 1 ? "member" : "members"}
      </span>
      <ChevronRightIcon className="size-3.5" aria-hidden />
    </button>
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
        const payer = memberNameIn(group, expense.payerId)
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
                        (id) => memberNameIn(group, id, "them"),
                      )}
                    </span>
                  ) : null}
                  {expense.locked || expense.leftMember ? <LockIcon className="size-3.5 text-muted-foreground" /> : null}
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
      <section>
        <div className="relative pt-6">
          <h2 className="absolute top-0 left-3 z-0 inline-flex rounded-[16px] bg-muted/80 px-3.5 pt-1.5 pb-8 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase ring-1 ring-border">
            Who pays whom
          </h2>
          <div className="relative z-10 rounded-[16px] bg-card p-4 ring-1 ring-border">
            {group.debts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone is square.</p>
            ) : (
              <ul className="space-y-2.5">
                {group.debts.map((debt) => {
                  const from = group.members.find((member) => member.id === debt.fromUserId)
                  const to = group.members.find((member) => member.id === debt.toUserId)
                  const mine = debt.fromUserId === userId || debt.toUserId === userId
                  return (
                    <li
                      key={`${debt.fromUserId}-${debt.toUserId}`}
                      className={cn(
                        "rounded-[14px] px-3 py-3",
                        mine ? "bg-accent/55" : "bg-muted/35",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Person id={debt.fromUserId} name={from?.displayName ?? "Someone"} size="sm" />
                          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <Person id={debt.toUserId} name={to?.displayName ?? "Someone"} size="sm" />
                        </div>
                        <span
                          className={cn(
                            "money shrink-0 text-lg",
                            debt.toUserId === userId
                              ? "text-positive"
                              : debt.fromUserId === userId
                                ? "text-negative"
                                : "",
                          )}
                        >
                          {formatINR(debt.amountPaise)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-medium">{phrase(debt, userId, group.members)}</p>
                    </li>
                  )
                })}
              </ul>
            )}
            {group.debts.some((debt) => debt.fromUserId === userId || debt.toUserId === userId) ? (
              <Link
                href={`/groups/${group.id}/settle`}
                className="mt-3 flex h-11 items-center justify-center rounded-[12px] bg-primary text-sm font-semibold text-primary-foreground transition active:scale-[0.99]"
              >
                Settle up
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className={cn(SECTION_TITLE, "px-1")}>Balances</h2>
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
