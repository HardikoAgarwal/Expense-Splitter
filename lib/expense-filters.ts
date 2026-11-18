/** Pure filtering for expense lists (search, people, category, date range). */

export type ExpenseFilters = {
  query: string
  paidBy: string | null
  involves: string | null
  category: string | null
  from: string | null // YYYY-MM-DD inclusive
  to: string | null // YYYY-MM-DD inclusive
}

export const EMPTY_FILTERS: ExpenseFilters = {
  query: "",
  paidBy: null,
  involves: null,
  category: null,
  from: null,
  to: null,
}

type Filterable = {
  description: string
  payerId: string
  expenseDate: string
  category: string | null
  shares: { userId: string; sharePaise: number }[]
}

export function activeFilterCount(filters: ExpenseFilters): number {
  return [filters.query.trim(), filters.paidBy, filters.involves, filters.category, filters.from, filters.to].filter(Boolean).length
}

export function filterExpenses<T extends Filterable>(expenses: T[], filters: ExpenseFilters): T[] {
  const words = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return expenses.filter((expense) => {
    if (words.length > 0) {
      const text = expense.description.toLowerCase()
      if (!words.every((word) => text.includes(word))) return false
    }
    if (filters.paidBy && expense.payerId !== filters.paidBy) return false
    if (filters.involves) {
      const inShares = expense.shares.some((share) => share.userId === filters.involves && share.sharePaise > 0)
      if (!inShares && expense.payerId !== filters.involves) return false
    }
    if (filters.category && (expense.category ?? "other") !== filters.category) return false
    if (filters.from && expense.expenseDate < filters.from) return false
    if (filters.to && expense.expenseDate > filters.to) return false
    return true
  })
}
