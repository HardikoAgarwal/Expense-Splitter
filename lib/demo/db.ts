import { randomBytes, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { isCategory } from "@/lib/categories"
import { DEMO_ACCOUNTS } from "@/lib/env"
import { AppError } from "@/lib/errors"
import {
  disputeNeedsMe,
  disputeTasks,
  flagBlockReason,
  type OpenFlag,
  requestResolveBlockReason,
  resolveFlagBlockReason,
  stillWrongBlockReason,
} from "@/lib/disputes"
import { todayISO } from "@/lib/money"
import {
  computeBalances,
  isExpenseLocked,
  lockDate,
  lockedAt,
  pairwiseIOwe,
  payableShares,
  simplifyDebts,
  validateShares,
  type LedgerSettlement,
} from "@/lib/ledger"
import type {
  DisputeEvent,
  ActivityItem,
  Balance,
  ShareNotice,
  Expense,
  GroupCard,
  GroupDetail,
  InvitePreview,
  Member,
  AppUser,
  CreatedAccount,
  SignupLink,
  SignupLinkPreview,
  SaveExpenseInput,
  SessionUser,
  Settlement,
} from "@/lib/types"
import {
  adminBlockReason,
  generateSecret,
  inviteBlockReason,
  inviteLimitReason,
  mutateUserBlockReason,
  GROUP_INVITE_USE_LIMIT,
  SIGNUP_LINK_DAYS,
  signInBlockReason,
  signupInputReason,
} from "@/lib/admin"
import { groupAdminBlockReason, memberExitBlockReason, promoteMemberBlockReason } from "@/lib/group-access"
import { hashPassword, verifyPassword } from "@/lib/demo/password"
import { DEMO_INVITES, IDS, seedExpenses } from "@/lib/demo/seed-data"
import { canModifyExpense, ONLY_CREATOR_MESSAGE } from "@/lib/expense-access"
import {
  deleteRecipients,
  describeDelete,
  describeEdit,
  editRecipients,
  type ExpenseSnapshot,
  type NoticeKind,
} from "@/lib/expense-changes"
import { isValidUpi, normalizeUpi } from "@/lib/upi"

type DemoUser = {
  id: string
  email: string
  displayName: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
  isAdmin: boolean
  disabled: boolean
  invited: boolean
  upiId?: string | null
}

type AccountInvite = {
  id: string
  userId: string
  token: string
  expiresAt: string
  usedAt: string | null
}

type SignupLinkRow = {
  id: string
  token: string
  createdBy: string
  expiresAt: string
  usedAt: string | null
}

type DemoExpense = Omit<Expense, "locked" | "disputed" | "flags">

type DemoFlag = {
  id: string
  expenseId: string
  userId: string
  reason: string | null
  createdAt: string
  resolvedAt: string | null
  resolvedBy: string | null
  awaiting?: "owner" | "flagger"
  events?: DisputeEvent[]
}

type DemoNotice = {
  id: string
  kind?: NoticeKind
  summary?: string | null
  description?: string
  userId: string
  expenseId: string | null
  groupId: string
  actorId: string
  sharePaise: number
  createdAt: string
  seenAt: string | null
}

type DemoDb = {
  users: DemoUser[]
  groups: { id: string; name: string; createdBy: string; createdAt: string }[]
  members: { groupId: string; userId: string; role: "admin" | "member"; joinedAt: string; leftAt?: string | null }[]
  invites: {
    id: string
    groupId: string
    code: string
    createdBy: string
    expiresAt: string
    createdAt: string
    uses?: number
    maxUses?: number
  }[]
  expenses: DemoExpense[]
  settlements: Settlement[]
  accountInvites: AccountInvite[]
  signupLinks: SignupLinkRow[]
  flags: DemoFlag[]
  notices: DemoNotice[]
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function dbPath() {
  return process.env.HISSA_DEMO_DB ?? path.join(process.cwd(), ".data", "demo-db.json")
}

let queue: Promise<unknown> = Promise.resolve()

function withDb<T>(fn: (db: DemoDb) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => fn(await load()))
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function load(): Promise<DemoDb> {
  const file = dbPath()
  try {
    const raw = await readFile(/* turbopackIgnore: true */ file, "utf8")
    return normalize(JSON.parse(raw) as DemoDb)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    const seeded = createSeed()
    await persist(seeded)
    return seeded
  }
}

async function persist(db: DemoDb) {
  const file = dbPath()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(/* turbopackIgnore: true */ file, JSON.stringify(db, null, 2))
}

function normalize(db: DemoDb): DemoDb {
  db.accountInvites ??= []
  db.signupLinks ??= []
  db.flags ??= []
  db.notices ??= []
  db.members = (db.members ?? []).map((member) => ({
    ...member,
    role: member.role === "member" ? "member" : "admin",
  }))
  db.users = db.users.map((user) => ({
    ...user,
    isAdmin: user.isAdmin ?? user.id === IDS.aarav,
    disabled: user.disabled ?? false,
    invited: user.invited ?? true,
  }))
  return db
}

function createSeed(): DemoDb {
  const createdAt = "2026-09-01T08:00:00.000Z"
  const users = DEMO_ACCOUNTS.map((account, index) => {
    const { hash, salt } = hashPassword(account.password)
    return {
      id: index === 0 ? IDS.aarav : IDS.meera,
      email: account.email,
      displayName: account.name,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt,
      isAdmin: index === 0,
      disabled: false,
      invited: true,
    }
  })

  return {
    users,
    groups: [
      { id: IDS.flat, name: "Flat 4B", createdBy: IDS.aarav, createdAt: "2026-09-02T08:00:00.000Z" },
      { id: IDS.trip, name: "Monsoon trip", createdBy: IDS.meera, createdAt: "2026-11-02T08:00:00.000Z" },
    ],
    members: [
      { groupId: IDS.flat, userId: IDS.aarav, role: "admin", joinedAt: "2026-09-02T08:00:00.000Z" },
      { groupId: IDS.flat, userId: IDS.meera, role: "member", joinedAt: "2026-09-02T09:00:00.000Z" },
      { groupId: IDS.trip, userId: IDS.meera, role: "admin", joinedAt: "2026-11-02T08:00:00.000Z" },
      { groupId: IDS.trip, userId: IDS.aarav, role: "member", joinedAt: "2026-11-02T08:10:00.000Z" },
    ],
    invites: [
      {
        id: "77777777-7777-4777-8777-000000000001",
        groupId: IDS.flat,
        code: DEMO_INVITES.flat,
        createdBy: IDS.aarav,
        expiresAt: "2027-06-01T00:00:00.000Z",
        createdAt: "2026-11-01T08:00:00.000Z",
      },
      {
        id: "77777777-7777-4777-8777-000000000002",
        groupId: IDS.trip,
        code: DEMO_INVITES.trip,
        createdBy: IDS.meera,
        expiresAt: "2027-06-01T00:00:00.000Z",
        createdAt: "2026-11-02T08:00:00.000Z",
      },
    ],
    expenses: seedExpenses(),
    settlements: [
      {
        id: "66666666-6666-4666-8666-000000000001",
        groupId: IDS.flat,
        fromUserId: IDS.meera,
        toUserId: IDS.aarav,
        amountPaise: 1_200_000,
        upToDate: "2026-10-31",
        status: "approved",
        createdBy: IDS.meera,
        createdAt: "2026-11-01T12:00:00.000Z",
        resolvedAt: "2026-11-01T18:00:00.000Z",
      },
      {
        id: "66666666-6666-4666-8666-000000000002",
        groupId: IDS.flat,
        fromUserId: IDS.meera,
        toUserId: IDS.aarav,
        amountPaise: 800_000,
        upToDate: "2026-11-10",
        status: "pending",
        createdBy: IDS.meera,
        createdAt: "2026-11-14T14:30:00.000Z",
        resolvedAt: null,
      },
    ],
    accountInvites: [],
    signupLinks: [],
    flags: [],
    notices: [],
  }
}

function publicUser(user: DemoUser): SessionUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    demo: true,
    isAdmin: user.isAdmin,
  }
}

function accessOf(user: DemoUser) {
  return { id: user.id, isAdmin: user.isAdmin, disabled: user.disabled, invited: user.invited }
}

function requireUser(db: DemoDb, userId: string) {
  const user = db.users.find((item) => item.id === userId)
  if (!user || signInBlockReason(accessOf(user))) throw new AppError("You need to sign in again")
  return user
}

function requireAdmin(db: DemoDb, userId: string) {
  const user = requireUser(db, userId)
  const blocked = adminBlockReason(accessOf(user))
  if (blocked) throw new AppError(blocked)
  return user
}

function memberIds(db: DemoDb, groupId: string) {
  return db.members.filter((member) => member.groupId === groupId && !member.leftAt).map((member) => member.userId)
}

/** Whether a group admin may step in for an expense whose creator has left. */
function expenseAccess(db: DemoDb, expense: { groupId: string; createdBy: string }, userId: string) {
  const role = db.members.find((member) => member.groupId === expense.groupId && member.userId === userId && !member.leftAt)?.role
  return {
    creatorLeft: !memberIds(db, expense.groupId).includes(expense.createdBy),
    isGroupAdmin: role === "admin",
  }
}

/** Name of the first person in this expense who has left the group, if any. */
function leftMemberIn(db: DemoDb, expense: { groupId: string; payerId: string; shares: { userId: string; sharePaise: number }[] }) {
  const active = new Set(memberIds(db, expense.groupId))
  const involved = [expense.payerId, ...expense.shares.filter((share) => share.sharePaise > 0).map((share) => share.userId)]
  const gone = involved.find((id) => !active.has(id))
  return gone ? (db.users.find((user) => user.id === gone)?.displayName ?? "Someone") : null
}

function assertMember(db: DemoDb, groupId: string, userId: string) {
  if (!memberIds(db, groupId).includes(userId)) throw new AppError("You are not in this group")
}

function membersOf(db: DemoDb, groupId: string, former = false): Member[] {
  return db.members
    .filter((member) => member.groupId === groupId && Boolean(member.leftAt) === former)
    .map((member) => {
      const user = db.users.find((item) => item.id === member.userId)
      return {
        id: member.userId,
        displayName: user?.displayName ?? "Someone",
        email: user?.email ?? "",
        role: member.role === "member" ? ("member" as const) : ("admin" as const),
      }
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return todayISO(d)
}

function ledgerSettlements(rows: Settlement[]): LedgerSettlement[] {
  return rows.map((settlement) => ({
    fromUserId: settlement.fromUserId,
    toUserId: settlement.toUserId,
    amountPaise: settlement.amountPaise,
    status: settlement.status,
    upToDate: settlement.upToDate,
    resolvedAt: settlement.resolvedAt,
    createdAt: settlement.createdAt,
    writeOff: settlement.writeOff,
  }))
}

function presentGroup(db: DemoDb, groupId: string, userId: string): GroupDetail | null {
  const group = db.groups.find((item) => item.id === groupId)
  if (!group || !memberIds(db, groupId).includes(userId)) return null
  const members = membersOf(db, groupId)
  const formerMembers = membersOf(db, groupId, true)
  const settlements = db.settlements
    .filter((settlement) => settlement.groupId === groupId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const ledger = ledgerSettlements(settlements)
  const lockedThrough = lockDate(ledger)
  const lockTime = lockedAt(ledger)
  const expenses: Expense[] = db.expenses
    .filter((expense) => expense.groupId === groupId)
    .map((expense) => {
      const flags = (db.flags ?? [])
        .filter((flag) => flag.expenseId === expense.id && !flag.resolvedAt)
        .map((flag) => ({
          id: flag.id,
          userId: flag.userId,
          reason: flag.reason,
          createdAt: flag.createdAt,
          awaiting: flag.awaiting ?? "owner",
          events: flag.events?.length
            ? flag.events
            : [{ id: `${flag.id}-flagged`, kind: "flagged" as const, actorId: flag.userId, note: flag.reason, createdAt: flag.createdAt }],
        }))
      return {
        ...expense,
        shares: expense.shares.filter((share) => share.sharePaise > 0),
        locked: isExpenseLocked(expense.expenseDate, lockedThrough, expense.createdAt, lockTime),
        leftMember: leftMemberIn(db, expense),
        creatorLeft: !memberIds(db, groupId).includes(expense.createdBy),
        ownerGone: !memberIds(db, groupId).includes(expense.createdBy) && !memberIds(db, groupId).includes(expense.payerId),
        disputed: flags.length > 0,
        flags,
      }
    })
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.localeCompare(a.createdAt))
  const balances: Balance[] = computeBalances(
    members.map((member) => member.id),
    expenses,
    ledgerSettlements(settlements),
  )
  const mine = balances.find((balance) => balance.userId === userId)
  return {
    id: group.id,
    name: group.name,
    createdBy: group.createdBy,
    members,
    formerMembers,
    expenses,
    balances,
    debts: simplifyDebts(balances),
    settlements,
    myNetPaise: mine?.netPaise ?? 0,
    lockDate: lockedThrough,
    myRole:
      db.members.find((member) => member.groupId === groupId && member.userId === userId && !member.leftAt)?.role === "admin"
        ? "admin"
        : "member",
  }
}

function assertDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new AppError("Choose a valid date")
  }
}

function inviteCode() {
  const bytes = randomBytes(8)
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("")
}

export async function authenticate(email: string, password: string): Promise<SessionUser> {
  return withDb((db) => {
    const user = db.users.find((item) => item.email === email.trim().toLowerCase())
    if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      throw new AppError("Email or password is incorrect")
    }
    const blocked = signInBlockReason(accessOf(user))
    if (blocked) throw new AppError(blocked)
    return publicUser(user)
  })
}

export async function register(): Promise<SessionUser> {
  throw new AppError("Access is by invite only")
}

export async function getUser(userId: string): Promise<SessionUser | null> {
  return withDb((db) => {
    const user = db.users.find((item) => item.id === userId)
    if (!user || signInBlockReason(accessOf(user))) return null
    return publicUser(user)
  })
}

function toAppUser(user: DemoUser): AppUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    disabled: user.disabled,
    createdAt: user.createdAt,
  }
}

function userHasHistory(db: DemoDb, userId: string) {
  return (
    db.expenses.some(
      (expense) => expense.payerId === userId || expense.shares.some((share) => share.userId === userId),
    ) ||
    db.settlements.some((settlement) => settlement.fromUserId === userId || settlement.toUserId === userId)
  )
}

export async function listAppUsers(actorId: string): Promise<AppUser[]> {
  return withDb((db) => {
    requireAdmin(db, actorId)
    return db.users.map(toAppUser).sort((a, b) => a.displayName.localeCompare(b.displayName))
  })
}

export async function createAccount(
  actorId: string,
  input: { email: string; displayName: string },
): Promise<CreatedAccount> {
  return withDb(async (db) => {
    requireAdmin(db, actorId)
    const email = input.email.trim().toLowerCase()
    const displayName = input.displayName.trim()
    if (displayName.length < 2 || displayName.length > 40) {
      throw new AppError("Name must be 2–40 characters")
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email")
    if (db.users.some((user) => user.email === email)) {
      throw new AppError("An account with that email already exists")
    }
    const temporaryPassword = generateSecret(12)
    const { hash, salt } = hashPassword(temporaryPassword)
    const user: DemoUser = {
      id: randomUUID(),
      email,
      displayName,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
      isAdmin: false,
      disabled: false,
      invited: true,
    }
    const token = generateSecret(24)
    db.users.push(user)
    db.accountInvites.push({
      id: randomUUID(),
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      usedAt: null,
    })
    await persist(db)
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      temporaryPassword,
      welcomePath: `/welcome/${token}`,
    }
  })
}

export async function setUserDisabled(actorId: string, userId: string, disabled: boolean) {
  return withDb(async (db) => {
    const actor = requireAdmin(db, actorId)
    const blocked = mutateUserBlockReason(accessOf(actor), userId)
    if (blocked) throw new AppError(blocked)
    const target = db.users.find((user) => user.id === userId)
    if (!target) throw new AppError("That person is not on Hissa")
    target.disabled = disabled
    await persist(db)
  })
}

export async function removeUser(actorId: string, userId: string) {
  return withDb(async (db) => {
    const actor = requireAdmin(db, actorId)
    const blocked = mutateUserBlockReason(accessOf(actor), userId)
    if (blocked) throw new AppError(blocked)
    const target = db.users.find((user) => user.id === userId)
    if (!target) throw new AppError("That person is not on Hissa")
    if (userHasHistory(db, userId)) {
      throw new AppError("This person has expenses. Disable their account instead.")
    }
    db.users = db.users.filter((user) => user.id !== userId)
    db.members = db.members.filter((member) => member.userId !== userId)
    db.accountInvites = db.accountInvites.filter((invite) => invite.userId !== userId)
    db.invites = db.invites.filter((invite) => invite.createdBy !== userId)
    await persist(db)
  })
}

export async function redeemWelcome(token: string, password: string) {
  return withDb(async (db) => {
    const invite = db.accountInvites.find((item) => item.token === token)
    if (!invite || invite.usedAt || Date.parse(invite.expiresAt) <= Date.now()) {
      throw new AppError("This invite link is invalid or expired")
    }
    if (password.length < 8) throw new AppError("Use at least 8 characters")
    const user = db.users.find((item) => item.id === invite.userId)
    if (!user) throw new AppError("This invite link is invalid or expired")
    const { hash, salt } = hashPassword(password)
    user.passwordHash = hash
    user.passwordSalt = salt
    user.invited = true
    invite.usedAt = new Date().toISOString()
    await persist(db)
    return user.email
  })
}

export async function updateName(userId: string, displayName: string): Promise<SessionUser> {
  return withDb(async (db) => {
    const user = requireUser(db, userId)
    const name = displayName.trim()
    if (name.length < 2 || name.length > 40) throw new AppError("Name must be 2–40 characters")
    user.displayName = name
    await persist(db)
    return publicUser(user)
  })
}

export async function updatePassword(userId: string, password: string) {
  return withDb(async (db) => {
    const user = requireUser(db, userId)
    if (password.length < 8) throw new AppError("Use at least 8 characters")
    const { hash, salt } = hashPassword(password)
    user.passwordHash = hash
    user.passwordSalt = salt
    await persist(db)
  })
}

export async function requestPasswordReset(_email: string) {
  throw new AppError("Email reset is unavailable in demo mode. Sign in, then change your password from Account.")
}

export async function listGroups(userId: string): Promise<GroupCard[]> {
  return withDb((db) => {
    requireUser(db, userId)
    return db.groups
      .filter((group) => memberIds(db, group.id).includes(userId))
      .map((group) => {
        const detail = presentGroup(db, group.id, userId)!
        return {
          id: group.id,
          name: group.name,
          members: detail.members,
          myNetPaise: detail.myNetPaise,
          pendingForMe: detail.settlements.filter(
            (settlement) => settlement.status === "pending" && settlement.toUserId === userId,
          ).length,
          disputedCount: detail.expenses.filter((expense) => expense.disputed).length,
          disputesForMe: detail.expenses
            .flatMap((expense) => expense.flags.map((flag) => ({ flag, expense })))
            .filter(({ flag, expense }) => disputeNeedsMe(flag, expense, userId)).length,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}

export async function createGroup(userId: string, name: string): Promise<string> {
  return withDb(async (db) => {
    requireUser(db, userId)
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 80) {
      throw new AppError("Group name must be 1–80 characters")
    }
    const id = randomUUID()
    const now = new Date().toISOString()
    db.groups.push({ id, name: trimmed, createdBy: userId, createdAt: now })
    db.members.push({ groupId: id, userId, role: "admin", joinedAt: now })
    await persist(db)
    return id
  })
}

export async function getGroup(userId: string, groupId: string): Promise<GroupDetail | null> {
  return withDb((db) => presentGroup(db, groupId, userId))
}

function assertGroupAdmin(db: DemoDb, groupId: string, userId: string) {
  const role = db.members.find((member) => member.groupId === groupId && member.userId === userId && !member.leftAt)?.role
  const blocked = groupAdminBlockReason(role)
  if (blocked) throw new AppError(blocked)
}

export async function renameGroup(userId: string, groupId: string, name: string) {
  return withDb(async (db) => {
    assertGroupAdmin(db, groupId, userId)
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 80) throw new AppError("Group name must be 1–80 characters")
    const group = db.groups.find((item) => item.id === groupId)
    if (!group) throw new AppError("That group is not available")
    group.name = trimmed
    await persist(db)
  })
}

export async function deleteGroup(userId: string, groupId: string) {
  return withDb(async (db) => {
    assertGroupAdmin(db, groupId, userId)
    db.groups = db.groups.filter((group) => group.id !== groupId)
    db.members = db.members.filter((member) => member.groupId !== groupId)
    db.invites = db.invites.filter((invite) => invite.groupId !== groupId)
    const expenseIds = new Set(db.expenses.filter((expense) => expense.groupId === groupId).map((expense) => expense.id))
    db.expenses = db.expenses.filter((expense) => expense.groupId !== groupId)
    db.settlements = db.settlements.filter((settlement) => settlement.groupId !== groupId)
    db.flags = db.flags.filter((flag) => !expenseIds.has(flag.expenseId))
    db.notices = db.notices.filter((notice) => notice.groupId !== groupId)
    await persist(db)
  })
}

function exitBlock(db: DemoDb, groupId: string, userId: string, self: boolean, ignoreMoney = false): string | null {
  const active = db.members.filter((member) => member.groupId === groupId && !member.leftAt)
  const target = active.find((member) => member.userId === userId)
  if (!target) return "That person is not in the group"
  const detail = presentGroup(db, groupId, active.find((member) => member.userId === userId)!.userId)
  return memberExitBlockReason({
    self,
    role: target.role,
    adminCount: active.filter((member) => member.role === "admin").length,
    memberCount: active.length,
    ignoreMoney,
    netPaise: detail?.myNetPaise ?? 0,
    pendingCount: db.settlements.filter(
      (settlement) =>
        settlement.groupId === groupId &&
        settlement.status === "pending" &&
        (settlement.fromUserId === userId || settlement.toUserId === userId),
    ).length,
  })
}

/** A leaver has settled to zero, so disputes they raised are moot: close them. */
function closeMemberFlags(db: DemoDb, groupId: string, userId: string, actorId: string) {
  const inGroup = new Set(db.expenses.filter((expense) => expense.groupId === groupId).map((expense) => expense.id))
  for (const flag of db.flags) {
    if (flag.userId !== userId || flag.resolvedAt || !inGroup.has(flag.expenseId)) continue
    flag.resolvedAt = new Date().toISOString()
    flag.resolvedBy = actorId
    addEvent(flag, "resolved", actorId, "Closed because they left the group")
  }
}

function markLeft(db: DemoDb, groupId: string, userId: string, actorId = userId) {
  closeMemberFlags(db, groupId, userId, actorId)
  const row = db.members.find((member) => member.groupId === groupId && member.userId === userId && !member.leftAt)
  if (row) row.leftAt = new Date().toISOString()
}

export async function removeMember(actorId: string, groupId: string, userId: string, writeOff = false) {
  return withDb(async (db) => {
    assertGroupAdmin(db, groupId, actorId)
    if (writeOff && actorId === userId) throw new AppError("You cannot write off your own balance")
    const blocked = exitBlock(db, groupId, userId, actorId === userId, writeOff)
    if (blocked) throw new AppError(blocked)
    if (writeOff) {
      // Cancel payments that would never be confirmed, then forgive exactly what the
      // leaver owed or was owed, so every other net balance stays exact.
      const detail = presentGroup(db, groupId, userId)
      db.settlements = db.settlements.filter(
        (item) =>
          !(item.groupId === groupId && item.status === "pending" && (item.fromUserId === userId || item.toUserId === userId)),
      )
      const now = new Date().toISOString()
      for (const debt of detail?.debts ?? []) {
        if (debt.fromUserId !== userId && debt.toUserId !== userId) continue
        db.settlements.push({
          id: randomUUID(),
          groupId,
          fromUserId: debt.fromUserId,
          toUserId: debt.toUserId,
          amountPaise: debt.amountPaise,
          upToDate: todayISO(),
          status: "approved",
          createdBy: actorId,
          createdAt: now,
          resolvedAt: now,
          writeOff: true,
        })
      }
    }
    markLeft(db, groupId, userId, actorId)
    await persist(db)
  })
}

export async function leaveGroup(userId: string, groupId: string) {
  return withDb(async (db) => {
    assertMember(db, groupId, userId)
    const blocked = exitBlock(db, groupId, userId, true)
    if (blocked) throw new AppError(blocked)
    markLeft(db, groupId, userId)
    await persist(db)
  })
}

export async function promoteMember(actorId: string, groupId: string, userId: string) {
  return withDb(async (db) => {
    assertGroupAdmin(db, groupId, actorId)
    const target = db.members.find((member) => member.groupId === groupId && member.userId === userId)
    if (!target) throw new AppError("That person is not in the group")
    const blocked = promoteMemberBlockReason({ actorRole: "admin", targetRole: target.role })
    if (blocked) throw new AppError(blocked)
    target.role = "admin"
    await persist(db)
  })
}

export async function revokeInvites(userId: string, groupId: string) {
  return withDb(async (db) => {
    assertGroupAdmin(db, groupId, userId)
    db.invites = db.invites.filter((invite) => invite.groupId !== groupId)
    await persist(db)
  })
}

export async function createInvite(userId: string, groupId: string) {
  return withDb(async (db) => {
    assertGroupAdmin(db, groupId, userId)
    let code = inviteCode()
    for (let attempt = 0; attempt < 5 && db.invites.some((invite) => invite.code === code); attempt++) {
      code = inviteCode()
    }
    const now = new Date()
    const invite = {
      id: randomUUID(),
      groupId,
      code,
      createdBy: userId,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
      uses: 0,
      maxUses: GROUP_INVITE_USE_LIMIT,
    }
    db.invites.push(invite)
    await persist(db)
    return { code: invite.code, expiresAt: invite.expiresAt }
  })
}

export async function regenerateInvite(userId: string, groupId: string) {
  await revokeInvites(userId, groupId)
  return createInvite(userId, groupId)
}

export async function previewInvite(userId: string | null, code: string): Promise<InvitePreview> {
  return withDb((db) => {
    const invite = db.invites.find((item) => item.code === code.trim().toUpperCase())
    if (!invite) return { valid: false, reason: "invalid" }
    if (Date.parse(invite.expiresAt) <= Date.now()) return { valid: false, reason: "expired" }
    const group = db.groups.find((item) => item.id === invite.groupId)
    if (!group) return { valid: false, reason: "invalid" }
    const already = userId ? memberIds(db, group.id).includes(userId) : false
    return {
      valid: true,
      reason: already ? "already_member" : undefined,
      groupId: group.id,
      groupName: group.name,
      expiresAt: invite.expiresAt,
      memberCount: memberIds(db, group.id).length,
    }
  })
}

export async function joinByCode(userId: string, code: string) {
  return withDb(async (db) => {
    requireUser(db, userId)
    const invite = db.invites.find((item) => item.code === code.trim().toUpperCase())
    if (!invite) throw new AppError("This invite is invalid")
    if (Date.parse(invite.expiresAt) <= Date.now()) throw new AppError("This invite has expired")
    if (memberIds(db, invite.groupId).includes(userId)) {
      return { groupId: invite.groupId, alreadyMember: true }
    }
    if ((invite.uses ?? 0) >= (invite.maxUses ?? GROUP_INVITE_USE_LIMIT)) {
      throw new AppError("This invite has reached its limit. Ask for a new one")
    }
    invite.uses = (invite.uses ?? 0) + 1
    const earlier = db.members.find((member) => member.groupId === invite.groupId && member.userId === userId)
    if (earlier) {
      earlier.leftAt = null
      earlier.role = "member"
      earlier.joinedAt = new Date().toISOString()
    } else {
      db.members.push({
        groupId: invite.groupId,
        userId,
        role: "member",
        joinedAt: new Date().toISOString(),
      })
    }
    await persist(db)
    return { groupId: invite.groupId, alreadyMember: false }
  })
}

export async function saveExpense(userId: string, input: SaveExpenseInput): Promise<string> {
  return withDb(async (db) => {
    assertMember(db, input.groupId, userId)
    const description = input.description.trim()
    if (description.length < 1 || description.length > 80) {
      throw new AppError("Description must be 1–80 characters")
    }
    assertDate(input.expenseDate)
    if (input.category && !isCategory(input.category)) throw new AppError("Unknown category")
    if (!memberIds(db, input.groupId).includes(input.payerId)) {
      throw new AppError("The payer needs to be in the group")
    }
    for (const share of input.shares) {
      if (!memberIds(db, input.groupId).includes(share.userId)) {
        throw new AppError("Every share must belong to someone in the group")
      }
    }
    const shares = payableShares(input.shares)
    const problem = validateShares(input.amountPaise, shares)
    if (problem) throw new AppError(problem)

    const settlements = db.settlements.filter((settlement) => settlement.groupId === input.groupId)
    const ledger = ledgerSettlements(settlements)
    const lockedThrough = lockDate(ledger)
    const lockTime = lockedAt(ledger)
    if (input.expenseDate > tomorrowISO()) throw new AppError("Expenses cannot be dated in the future")
    // A brand-new row counts as created after any settlement, so only earlier days are locked.
    if (isExpenseLocked(input.expenseDate, lockedThrough, new Date().toISOString(), lockTime)) {
      throw new AppError("That date is locked by an approved settlement")
    }

    const now = new Date().toISOString()
    if (!input.id) {
      const expense: DemoExpense = {
        id: randomUUID(),
        groupId: input.groupId,
        description,
        amountPaise: input.amountPaise,
        payerId: input.payerId,
        expenseDate: input.expenseDate,
        category: input.category,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        shares,
      }
      db.expenses.push(expense)
      recordShareNotices(db, userId, expense, new Set())
      await persist(db)
      return expense.id
    }

    const existing = db.expenses.find((expense) => expense.id === input.id)
    if (!existing || existing.groupId !== input.groupId) throw new AppError("Expense not found")
    if (!canModifyExpense(existing, userId, expenseAccess(db, existing, userId))) throw new AppError(ONLY_CREATOR_MESSAGE)
    const gone = leftMemberIn(db, existing)
    if (gone) throw new AppError(`${gone} left the group, so this expense can no longer be changed`)
    if (isExpenseLocked(existing.expenseDate, lockedThrough, existing.createdAt, lockTime)) {
      throw new AppError("This expense is locked by an approved settlement")
    }
    const previous = new Set(existing.shares.filter((share) => share.sharePaise > 0).map((share) => share.userId))
    const before = demoSnapshot(existing)
    existing.description = description
    existing.amountPaise = input.amountPaise
    existing.payerId = input.payerId
    existing.expenseDate = input.expenseDate
    existing.category = input.category
    existing.shares = shares
    existing.updatedAt = now
    recordShareNotices(db, userId, existing, previous)
    recordChangeNotices(db, userId, "edited", before, demoSnapshot(existing))
    await persist(db)
    return existing.id
  })
}

function demoSnapshot(expense: DemoExpense): ExpenseSnapshot {
  return {
    id: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    amountPaise: expense.amountPaise,
    payerId: expense.payerId,
    expenseDate: expense.expenseDate,
    category: expense.category ?? null,
    createdBy: expense.createdBy,
    shares: expense.shares.map((share) => ({ userId: share.userId, sharePaise: share.sharePaise })),
  }
}

/** Mirrors lib/push.ts: edited/deleted notices for everyone else who had or has a share. */
function recordChangeNotices(
  db: DemoDb,
  actorId: string,
  kind: "edited" | "deleted",
  before: ExpenseSnapshot,
  after: ExpenseSnapshot | null,
) {
  const now = new Date().toISOString()
  const nameOf = (id: string) => (db.users.find((user) => user.id === id)?.displayName ?? "Someone").split(" ")[0]
  const snapshot = after ?? before
  const recipients = after ? editRecipients(before, after, actorId).edited : deleteRecipients(before, actorId)
  for (const recipient of recipients) {
    const summary = after ? describeEdit(before, after, recipient, nameOf) : describeDelete(before, recipient)
    if (!summary) continue
    db.notices.push({
      id: randomUUID(),
      kind,
      summary,
      description: snapshot.description,
      userId: recipient,
      expenseId: after ? snapshot.id : null,
      groupId: snapshot.groupId,
      actorId,
      sharePaise: snapshot.shares.find((share) => share.userId === recipient)?.sharePaise ?? 0,
      createdAt: now,
      seenAt: null,
    })
  }
}

function recordShareNotices(db: DemoDb, actorId: string, expense: DemoExpense, alreadyShared: Set<string>) {
  const now = new Date().toISOString()
  for (const share of expense.shares) {
    if (share.sharePaise <= 0 || share.userId === actorId || alreadyShared.has(share.userId)) continue
    db.notices.push({
      id: randomUUID(),
      userId: share.userId,
      expenseId: expense.id,
      groupId: expense.groupId,
      actorId,
      sharePaise: share.sharePaise,
      createdAt: now,
      seenAt: null,
    })
  }
}

export async function deleteExpense(userId: string, expenseId: string) {
  return withDb(async (db) => {
    const existing = db.expenses.find((expense) => expense.id === expenseId)
    if (!existing) throw new AppError("Expense not found")
    assertMember(db, existing.groupId, userId)
    if (!canModifyExpense(existing, userId, expenseAccess(db, existing, userId))) throw new AppError(ONLY_CREATOR_MESSAGE)
    const gone = leftMemberIn(db, existing)
    if (gone) throw new AppError(`${gone} left the group, so this expense can no longer be changed`)
    const ledger = ledgerSettlements(db.settlements.filter((settlement) => settlement.groupId === existing.groupId))
    if (isExpenseLocked(existing.expenseDate, lockDate(ledger), existing.createdAt, lockedAt(ledger))) {
      throw new AppError("This expense is locked by an approved settlement")
    }
    db.expenses = db.expenses.filter((expense) => expense.id !== expenseId)
    db.flags = db.flags.filter((flag) => flag.expenseId !== expenseId)
    db.notices = db.notices.filter((notice) => notice.expenseId !== expenseId)
    recordChangeNotices(db, userId, "deleted", demoSnapshot(existing), null)
    await persist(db)
  })
}

function disputeNotice(db: DemoDb, kind: NoticeKind, to: string, actorId: string, expense: DemoExpense, note: string | null) {
  if (to === actorId) return
  db.notices.push({
    id: randomUUID(),
    kind,
    summary: note,
    description: expense.description,
    userId: to,
    expenseId: expense.id,
    groupId: expense.groupId,
    actorId,
    sharePaise: 0,
    createdAt: new Date().toISOString(),
    seenAt: null,
  })
}

/** Tell the person who added it, and the payer if that's someone else. */
function noticeOwners(db: DemoDb, kind: NoticeKind, actorId: string, expense: DemoExpense, note: string | null) {
  disputeNotice(db, kind, expense.createdBy, actorId, expense, note)
  if (expense.payerId !== expense.createdBy) disputeNotice(db, kind, expense.payerId, actorId, expense, note)
}

function cleanNote(note: string) {
  const value = note.trim()
  if (value.length > 200) throw new AppError("Keep the note under 200 characters")
  return value || null
}

function openDemoFlag(db: DemoDb, flagId: string) {
  const flag = db.flags.find((item) => item.id === flagId && !item.resolvedAt)
  if (!flag) throw new AppError("That dispute is already resolved")
  const expense = db.expenses.find((item) => item.id === flag.expenseId)
  if (!expense) throw new AppError("Expense not found")
  flag.events ??= [{ id: `${flag.id}-flagged`, kind: "flagged", actorId: flag.userId, note: flag.reason, createdAt: flag.createdAt }]
  return { flag, expense, awaiting: flag.awaiting ?? "owner" }
}

function addEvent(flag: DemoFlag, kind: DisputeEvent["kind"], actorId: string, note: string | null) {
  flag.events ??= []
  flag.events.push({ id: randomUUID(), kind, actorId, note, createdAt: new Date().toISOString() })
}

export async function flagExpense(userId: string, expenseId: string, reason: string) {
  return withDb(async (db) => {
    const expense = db.expenses.find((item) => item.id === expenseId)
    if (!expense) throw new AppError("Expense not found")
    assertMember(db, expense.groupId, userId)
    const share = expense.shares.find((item) => item.userId === userId)?.sharePaise ?? 0
    const blocked = flagBlockReason({ sharePaise: share, actorId: userId, creatorId: expense.createdBy })
    if (blocked) throw new AppError(blocked)
    const note = cleanNote(reason)
    let flag = db.flags.find((item) => item.expenseId === expenseId && item.userId === userId && !item.resolvedAt)
    if (flag) {
      flag.reason = note
      flag.awaiting = "owner"
    } else {
      flag = {
        id: randomUUID(),
        expenseId,
        userId,
        reason: note,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
        awaiting: "owner",
        events: [],
      }
      db.flags.push(flag)
    }
    addEvent(flag, "flagged", userId, note)
    noticeOwners(db, "flagged", userId, expense, note)
    await persist(db)
    return flag.id
  })
}

export async function requestResolve(userId: string, flagId: string, note: string) {
  return withDb(async (db) => {
    const { flag, expense, awaiting } = openDemoFlag(db, flagId)
    const blocked = requestResolveBlockReason({ actorId: userId, creatorId: expense.createdBy, payerId: expense.payerId, awaiting })
    if (blocked) throw new AppError(blocked)
    const value = cleanNote(note)
    flag.awaiting = "flagger"
    addEvent(flag, "resolve_requested", userId, value)
    disputeNotice(db, "resolve_requested", flag.userId, userId, expense, value)
    await persist(db)
  })
}

export async function resolveFlag(userId: string, flagId: string) {
  return withDb(async (db) => {
    const { flag, expense } = openDemoFlag(db, flagId)
    const active = memberIds(db, expense.groupId)
    const isAdmin = db.members.some(
      (member) => member.groupId === expense.groupId && member.userId === userId && !member.leftAt && member.role === "admin",
    )
    const blocked = resolveFlagBlockReason({
      actorId: userId,
      flaggerId: flag.userId,
      adminCanClose: isAdmin && !active.includes(expense.createdBy) && !active.includes(expense.payerId),
    })
    if (blocked) throw new AppError(blocked)
    flag.resolvedAt = new Date().toISOString()
    flag.resolvedBy = userId
    addEvent(flag, "resolved", userId, null)
    noticeOwners(db, "resolved", userId, expense, null)
    await persist(db)
  })
}

export async function stillWrong(userId: string, flagId: string, note: string) {
  return withDb(async (db) => {
    const { flag, expense, awaiting } = openDemoFlag(db, flagId)
    const blocked = stillWrongBlockReason({ actorId: userId, flaggerId: flag.userId, awaiting })
    if (blocked) throw new AppError(blocked)
    const value = cleanNote(note)
    flag.awaiting = "owner"
    addEvent(flag, "still_wrong", userId, value)
    noticeOwners(db, "still_wrong", userId, expense, value)
    await persist(db)
  })
}

export async function markNoticeSeen(userId: string, noticeId: string) {
  return withDb(async (db) => {
    const notice = db.notices.find((item) => item.id === noticeId && item.userId === userId)
    if (!notice || notice.seenAt) return
    notice.seenAt = new Date().toISOString()
    await persist(db)
  })
}

export async function markNoticesSeen(userId: string, noticeIds: string[] | null) {
  return withDb(async (db) => {
    const now = new Date().toISOString()
    let changed = 0
    for (const notice of db.notices) {
      if (notice.userId !== userId || notice.seenAt) continue
      if (noticeIds && !noticeIds.includes(notice.id)) continue
      notice.seenAt = now
      changed += 1
    }
    if (changed) await persist(db)
  })
}

export async function suggestSettlement(userId: string, groupId: string, otherUserId: string, upToDate: string) {
  return withDb((db) => {
    assertMember(db, groupId, userId)
    if (!memberIds(db, groupId).includes(otherUserId)) throw new AppError("That person is not in the group")
    assertDate(upToDate)
    const expenses = db.expenses.filter((expense) => expense.groupId === groupId)
    const settlements = db.settlements.filter((settlement) => settlement.groupId === groupId)
    return pairwiseIOwe({
      me: userId,
      other: otherUserId,
      upToDate,
      expenses,
      settlements: ledgerSettlements(settlements),
    })
  })
}

export async function requestSettlement(
  userId: string,
  input: { groupId: string; toUserId: string; amountPaise: number; upToDate: string },
) {
  return withDb(async (db) => {
    assertMember(db, input.groupId, userId)
    if (input.toUserId === userId) throw new AppError("Pick someone else")
    if (!memberIds(db, input.groupId).includes(input.toUserId)) {
      throw new AppError("That person is not in the group")
    }
    assertDate(input.upToDate)
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new AppError("Enter an amount greater than zero")
    }
    const now = new Date().toISOString()
    const settlement: Settlement = {
      id: randomUUID(),
      groupId: input.groupId,
      fromUserId: userId,
      toUserId: input.toUserId,
      amountPaise: input.amountPaise,
      upToDate: input.upToDate,
      status: "pending",
      createdBy: userId,
      createdAt: now,
      resolvedAt: null,
    }
    db.settlements.push(settlement)
    await persist(db)
    return settlement.id
  })
}

export async function resolveSettlement(userId: string, settlementId: string, approve: boolean) {
  return withDb(async (db) => {
    const settlement = db.settlements.find((item) => item.id === settlementId)
    if (!settlement) throw new AppError("Settlement not found")
    if (settlement.toUserId !== userId) {
      throw new AppError("Only the person being paid can approve or reject")
    }
    if (settlement.status !== "pending") throw new AppError("This settlement is already resolved")
    settlement.status = approve ? "approved" : "rejected"
    settlement.resolvedAt = new Date().toISOString()
    await persist(db)
  })
}

export async function cancelSettlement(userId: string, settlementId: string) {
  return withDb(async (db) => {
    const settlement = db.settlements.find((item) => item.id === settlementId)
    if (!settlement) throw new AppError("Settlement not found")
    if (settlement.createdBy !== userId && settlement.fromUserId !== userId) {
      throw new AppError("Only the requester can cancel")
    }
    if (settlement.status !== "pending") throw new AppError("This settlement is already resolved")
    db.settlements = db.settlements.filter((item) => item.id !== settlementId)
    await persist(db)
  })
}

export async function getActivity(userId: string) {
  return withDb((db) => {
    requireUser(db, userId)
    const details = db.groups
      .filter((group) => memberIds(db, group.id).includes(userId))
      .map((group) => presentGroup(db, group.id, userId)!)
    return buildActivity(userId, details, db.notices ?? [])
  })
}

export function buildActivity(
  userId: string,
  details: GroupDetail[],
  storedNotices: DemoNotice[] = [],
) {
  const feed: ActivityItem[] = []
  for (const group of details) {
    const nameOf = (id: string) => group.members.find((member) => member.id === id)?.displayName ?? "Someone"
    for (const expense of group.expenses) {
      const payer = nameOf(expense.payerId)
      feed.push({
        id: expense.id,
        kind: "expense",
        groupId: group.id,
        groupName: group.name,
        createdAt: expense.createdAt,
        actorId: expense.payerId,
        actorName: payer,
        title: expense.description,
        subtitle: `${payer} paid · ${group.name}`,
        amountPaise: expense.amountPaise,
      })
    }
    for (const settlement of group.settlements) {
      const incoming = settlement.toUserId === userId
      const outgoing = settlement.fromUserId === userId
      feed.push({
        id: settlement.id,
        kind: "settlement",
        groupId: group.id,
        groupName: group.name,
        createdAt: settlement.createdAt,
        actorId: settlement.fromUserId,
        actorName: nameOf(settlement.fromUserId),
        title: settlement.writeOff
          ? "Balance written off"
          : settlement.status === "pending"
            ? `${nameOf(settlement.fromUserId)} recorded a payment`
            : settlement.status === "approved"
              ? "Payment confirmed"
              : "Payment declined",
        subtitle: settlement.writeOff
          ? `${nameOf(settlement.fromUserId)} owed ${nameOf(settlement.toUserId)} · ${group.name}`
          : `${nameOf(settlement.fromUserId)} to ${nameOf(settlement.toUserId)} · ${group.name}`,
        amountPaise: settlement.amountPaise,
        status: settlement.status,
        settlementId: settlement.id,
        direction: incoming ? "incoming" : outgoing ? "outgoing" : "other",
      })
    }
  }
  feed.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const pending = feed.filter(
    (item) => item.kind === "settlement" && item.status === "pending" && item.direction === "incoming",
  )
  const notices: ShareNotice[] = []
  for (const group of details) {
    const nameOf = (id: string) => group.members.find((member) => member.id === id)?.displayName ?? "Someone"
    for (const notice of storedNotices.filter((item) => item.groupId === group.id)) {
      if (notice.userId !== userId) continue
      const expense = group.expenses.find((item) => item.id === notice.expenseId)
      notices.push({
        id: notice.id,
        kind: notice.kind ?? "added",
        summary: notice.summary ?? null,
        expenseId: notice.expenseId,
        groupId: group.id,
        groupName: group.name,
        actorId: notice.actorId,
        actorName: nameOf(notice.actorId),
        description: expense?.description ?? notice.description ?? "an expense",
        sharePaise: notice.sharePaise,
        createdAt: notice.createdAt,
        seen: Boolean(notice.seenAt),
      })
    }
  }
  notices.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const openFlags: OpenFlag[] = details.flatMap((group) =>
    group.expenses.flatMap((expense) =>
      expense.flags.map((flag) => ({
        flag,
        expenseId: expense.id,
        groupId: group.id,
        groupName: group.name,
        description: expense.description,
        amountPaise: expense.amountPaise,
        createdBy: expense.createdBy,
        payerId: expense.payerId,
        updatedAt: expense.updatedAt,
      })),
    ),
  )
  const everyone = details.flatMap((group) => group.members)
  const nameOf = (id: string) => everyone.find((member) => member.id === id)?.displayName ?? "Someone"
  return {
    pending,
    disputes: disputeTasks(openFlags, userId, nameOf),
    notices,
    feed: feed.filter((item) => !pending.some((itemPending) => itemPending.id === item.id)),
  }
}

export async function getUpiId(userId: string): Promise<string | null> {
  return withDb((db) => db.users.find((item) => item.id === userId)?.upiId ?? null)
}

export async function updateUpi(userId: string, upiId: string | null): Promise<string | null> {
  return withDb(async (db) => {
    const user = requireUser(db, userId)
    const value = normalizeUpi(upiId)
    if (value && !isValidUpi(value)) throw new AppError("That doesn't look like a valid UPI ID (name@bank)")
    user.upiId = value
    await persist(db)
    return value
  })
}

export async function getUpiIds(): Promise<Record<string, string>> {
  return withDb((db) => {
    const out: Record<string, string> = {}
    for (const user of db.users) if (user.upiId) out[user.id] = user.upiId
    return out
  })
}

export async function createSignupLink(actorId: string): Promise<SignupLink> {
  return withDb(async (db) => {
    const actor = requireUser(db, actorId)
    const blocked = inviteBlockReason(accessOf(actor))
    if (blocked) throw new AppError(blocked)
    const sent = db.signupLinks.filter((link) => link.createdBy === actorId).length
    const limited = inviteLimitReason(accessOf(actor), sent)
    if (limited) throw new AppError(limited)
    const token = generateSecret(24)
    const expiresAt = new Date(Date.now() + SIGNUP_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    db.signupLinks.push({ id: randomUUID(), token, createdBy: actorId, expiresAt, usedAt: null })
    await persist(db)
    return { path: `/invite/${token}`, expiresAt }
  })
}

export async function previewSignupLink(token: string): Promise<SignupLinkPreview> {
  return withDb((db) => {
    const link = db.signupLinks.find((item) => item.token === token)
    if (!link || link.usedAt || Date.parse(link.expiresAt) <= Date.now()) return { valid: false }
    const inviter = db.users.find((user) => user.id === link.createdBy)
    return { valid: true, inviterName: inviter?.displayName }
  })
}

export async function redeemSignupLink(token: string, input: { name: string; email: string; password: string }) {
  return withDb(async (db) => {
    const problem = signupInputReason(input)
    if (problem) throw new AppError(problem)
    const link = db.signupLinks.find((item) => item.token === token)
    if (!link || link.usedAt || Date.parse(link.expiresAt) <= Date.now()) {
      throw new AppError("This invite link is invalid or already used")
    }
    const email = input.email.trim().toLowerCase()
    if (db.users.some((user) => user.email === email)) {
      throw new AppError("An account with that email already exists")
    }
    const { hash, salt } = hashPassword(input.password)
    db.users.push({
      id: randomUUID(),
      email,
      displayName: input.name.trim(),
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
      isAdmin: false,
      disabled: false,
      invited: true,
    })
    link.usedAt = new Date().toISOString()
    await persist(db)
    return email
  })
}

export async function createInvitedUser(input: { name: string; email: string; password: string }) {
  return withDb(async (db) => {
    const problem = signupInputReason(input)
    if (problem) throw new AppError(problem)
    const email = input.email.trim().toLowerCase()
    if (db.users.some((user) => user.email === email)) {
      throw new AppError("An account with that email already exists. Sign in instead.")
    }
    const { hash, salt } = hashPassword(input.password)
    db.users.push({
      id: randomUUID(),
      email,
      displayName: input.name.trim(),
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
      isAdmin: false,
      disabled: false,
      invited: true,
    })
    await persist(db)
    return email
  })
}
