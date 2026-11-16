export type Share = { userId: string; sharePaise: number }

export type SessionUser = {
  id: string
  email: string
  displayName: string
  demo: boolean
  isAdmin: boolean
}

export type AppUser = {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  disabled: boolean
  createdAt: string
}

export type CreatedAccount = {
  id: string
  email: string
  displayName: string
  temporaryPassword: string
  welcomePath: string
}

export type Member = {
  id: string
  displayName: string
  email: string
  role: "admin" | "member"
}

export type ExpenseFlag = {
  id: string
  userId: string
  reason: string | null
  createdAt: string
}

export type Expense = {
  id: string
  groupId: string
  description: string
  amountPaise: number
  payerId: string
  expenseDate: string
  category: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  shares: Share[]
  locked: boolean
  disputed: boolean
  flags: ExpenseFlag[]
}

export type ShareNotice = {
  id: string
  expenseId: string
  groupId: string
  groupName: string
  actorId: string
  actorName: string
  description: string
  sharePaise: number
  createdAt: string
  seen: boolean
}

export type SettlementStatus = "pending" | "approved" | "rejected"

export type Settlement = {
  id: string
  groupId: string
  fromUserId: string
  toUserId: string
  amountPaise: number
  upToDate: string
  status: SettlementStatus
  createdBy: string
  createdAt: string
  resolvedAt: string | null
}

export type Balance = {
  userId: string
  paidPaise: number
  owedPaise: number
  settlementsPaidPaise: number
  settlementsReceivedPaise: number
  netPaise: number
}

export type Debt = {
  fromUserId: string
  toUserId: string
  amountPaise: number
}

export type GroupCard = {
  id: string
  name: string
  members: Member[]
  myNetPaise: number
  pendingForMe: number
  disputedCount: number
}

export type GroupDetail = {
  id: string
  name: string
  createdBy: string
  members: Member[]
  expenses: Expense[]
  balances: Balance[]
  debts: Debt[]
  settlements: Settlement[]
  myNetPaise: number
  lockDate: string | null
  myRole: "admin" | "member"
}

export type InvitePreview = {
  valid: boolean
  reason?: "invalid" | "expired" | "already_member"
  groupId?: string
  groupName?: string
  expiresAt?: string
  memberCount?: number
}

export type ActivityItem = {
  id: string
  kind: "expense" | "settlement"
  groupId: string
  groupName: string
  createdAt: string
  actorId: string
  actorName: string
  title: string
  subtitle: string
  amountPaise: number
  status?: SettlementStatus
  settlementId?: string
  direction?: "incoming" | "outgoing" | "other"
}

export type CategoryTotal = { category: string; totalPaise: number }

export type MonthBreakdown = {
  monthStart: string
  totalPaise: number
  mySharePaise: number
  categories: CategoryTotal[]
}

export type GroupSummary = {
  group: { id: string; name: string; members: Member[] }
  monthStart: string
  groupTotalPaise: number
  mySharePaise: number
  myNetPaise: number
  debts: Debt[]
  months: MonthBreakdown[]
}

export type SaveExpenseInput = {
  id?: string
  groupId: string
  description: string
  amountPaise: number
  payerId: string
  expenseDate: string
  category: string | null
  shares: Share[]
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }
