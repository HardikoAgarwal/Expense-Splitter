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

export type SignupLink = {
  path: string
  expiresAt: string
}

export type SignupLinkPreview = {
  valid: boolean
  inviterName?: string
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

export type DisputeEventKind = "flagged" | "resolve_requested" | "still_wrong" | "resolved"

export type DisputeEvent = {
  id: string
  kind: DisputeEventKind
  actorId: string
  note: string | null
  createdAt: string
}

export type ExpenseFlag = {
  id: string
  userId: string
  reason: string | null
  createdAt: string
  /** Whose move it is: the owner (who added or paid) fixes and asks; the flagger resolves or says still wrong. */
  awaiting: "owner" | "flagger"
  events: DisputeEvent[]
}

/** An open dispute that needs the viewer to act, for Activity → Needs you. */
export type DisputeTask = {
  flagId: string
  expenseId: string
  groupId: string
  groupName: string
  description: string
  amountPaise: number
  role: "owner" | "flagger"
  flaggerId: string
  flaggerName: string
  ownerId: string
  ownerName: string
  reason: string | null
  /** The newest note in the thread (request or "still wrong"), if any. */
  note: string | null
  lastKind: DisputeEventKind
  updatedSinceRaised: boolean
  canEdit: boolean
  at: string
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
  /** Name of someone in this expense who has left the group; it can no longer be changed. */
  leftMember?: string | null
  /** The person who added this expense has left the group. */
  creatorLeft?: boolean
  disputed: boolean
  flags: ExpenseFlag[]
}

export type NoticeKind = "added" | "edited" | "deleted" | "flagged" | "resolve_requested" | "still_wrong" | "resolved"

export type ShareNotice = {
  id: string
  kind: NoticeKind
  /** Edited/deleted notices: what changed, e.g. "₹1,200 → ₹1,500 · your share ₹600 → ₹750". */
  summary: string | null
  /** Null for deleted expenses. */
  expenseId: string | null
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
  /** An admin forgave this amount when removing someone; no money moved. */
  writeOff?: boolean
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
  /** Open disputes where the next move is yours. */
  disputesForMe: number
}

export type GroupDetail = {
  id: string
  name: string
  createdBy: string
  members: Member[]
  /** People who left the group. Kept so old expenses still show their names. */
  formerMembers: Member[]
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

export type SummaryExpenseRow = {
  id: string
  groupId: string
  description: string
  amountPaise: number
  payerId: string
  expenseDate: string
  category: string | null
  shares: Share[]
}
