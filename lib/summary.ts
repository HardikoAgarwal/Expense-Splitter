/** Pure monthly-summary math. Works on any list of expenses (one group or all groups). */

export type SummaryExpense = {
  id: string
  groupId: string
  amountPaise: number
  payerId: string
  expenseDate: string // YYYY-MM-DD
  category: string | null
  shares: { userId: string; sharePaise: number }[]
}

export type CategorySlice = { category: string; totalPaise: number; mySharePaise: number; count: number }
export type PayerSlice = { userId: string; paidPaise: number; count: number }
export type GroupSlice = { groupId: string; totalPaise: number; mySharePaise: number }
export type MonthPoint = { monthStart: string; totalPaise: number; mySharePaise: number }

export type MonthlySummary = {
  monthStart: string
  totalPaise: number
  mySharePaise: number
  myPaidPaise: number
  count: number
  categories: CategorySlice[]
  payers: PayerSlice[]
  groups: GroupSlice[]
  /** Every month that has spending, newest first, plus the selected month. */
  months: MonthPoint[]
}

export function monthOf(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

export function shiftMonth(monthStart: string, delta: number): string {
  const [year, month] = monthStart.split("-").map(Number)
  const index = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(index / 12)
  const nextMonth = (index % 12) + 1
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
}

function myShare(expense: SummaryExpense, userId: string) {
  return expense.shares.find((share) => share.userId === userId)?.sharePaise ?? 0
}

export function summarizeMonth(expenses: SummaryExpense[], userId: string, monthStart: string): MonthlySummary {
  const selected = monthOf(monthStart)
  const inMonth = expenses.filter((expense) => monthOf(expense.expenseDate) === selected)

  const categories = new Map<string, CategorySlice>()
  const payers = new Map<string, PayerSlice>()
  const groups = new Map<string, GroupSlice>()
  let totalPaise = 0
  let mySharePaise = 0
  let myPaidPaise = 0

  for (const expense of inMonth) {
    const mine = myShare(expense, userId)
    totalPaise += expense.amountPaise
    mySharePaise += mine
    if (expense.payerId === userId) myPaidPaise += expense.amountPaise

    const key = expense.category ?? "other"
    const category = categories.get(key) ?? { category: key, totalPaise: 0, mySharePaise: 0, count: 0 }
    category.totalPaise += expense.amountPaise
    category.mySharePaise += mine
    category.count += 1
    categories.set(key, category)

    const payer = payers.get(expense.payerId) ?? { userId: expense.payerId, paidPaise: 0, count: 0 }
    payer.paidPaise += expense.amountPaise
    payer.count += 1
    payers.set(expense.payerId, payer)

    const group = groups.get(expense.groupId) ?? { groupId: expense.groupId, totalPaise: 0, mySharePaise: 0 }
    group.totalPaise += expense.amountPaise
    group.mySharePaise += mine
    groups.set(expense.groupId, group)
  }

  const monthMap = new Map<string, MonthPoint>()
  for (const expense of expenses) {
    const key = monthOf(expense.expenseDate)
    const point = monthMap.get(key) ?? { monthStart: key, totalPaise: 0, mySharePaise: 0 }
    point.totalPaise += expense.amountPaise
    point.mySharePaise += myShare(expense, userId)
    monthMap.set(key, point)
  }
  if (!monthMap.has(selected)) monthMap.set(selected, { monthStart: selected, totalPaise: 0, mySharePaise: 0 })

  const byAmount = <T extends { totalPaise?: number; paidPaise?: number }>(a: T, b: T) =>
    (b.totalPaise ?? b.paidPaise ?? 0) - (a.totalPaise ?? a.paidPaise ?? 0)

  return {
    monthStart: selected,
    totalPaise,
    mySharePaise,
    myPaidPaise,
    count: inMonth.length,
    categories: [...categories.values()].sort(byAmount),
    payers: [...payers.values()].sort(byAmount),
    groups: [...groups.values()].sort(byAmount),
    months: [...monthMap.values()].sort((a, b) => b.monthStart.localeCompare(a.monthStart)),
  }
}

/** The last `count` months ending at `monthStart`, oldest first, for a small trend chart. */
export function trend(months: MonthPoint[], monthStart: string, count = 6): MonthPoint[] {
  const byMonth = new Map(months.map((point) => [point.monthStart, point]))
  return Array.from({ length: count }, (_, index) => {
    const key = shiftMonth(monthOf(monthStart), index - (count - 1))
    return byMonth.get(key) ?? { monthStart: key, totalPaise: 0, mySharePaise: 0 }
  })
}
