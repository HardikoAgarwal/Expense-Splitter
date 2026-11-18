import { describe, expect, it } from "vitest"

import { filterExpenses, EMPTY_FILTERS } from "@/lib/expense-filters"
import { shiftMonth, summarizeMonth, trend, type SummaryExpense } from "@/lib/summary"

const A = "aarav"
const M = "meera"

function expense(partial: Partial<SummaryExpense> & { amountPaise: number; expenseDate: string; description?: string }): SummaryExpense & {
  description: string
} {
  return {
    id: Math.random().toString(36).slice(2),
    groupId: "g1",
    payerId: A,
    category: null,
    shares: [
      { userId: A, sharePaise: Math.floor(partial.amountPaise / 2) },
      { userId: M, sharePaise: partial.amountPaise - Math.floor(partial.amountPaise / 2) },
    ],
    description: "Thing",
    ...partial,
  }
}

const data = [
  expense({ amountPaise: 30000_00, expenseDate: "2026-11-01", category: "rent", payerId: M, description: "November rent" }),
  expense({ amountPaise: 1250_50, expenseDate: "2026-11-05", category: "groceries", description: "Big basket" }),
  expense({ amountPaise: 450_00, expenseDate: "2026-11-20", category: "groceries", payerId: M, description: "Milk" }),
  expense({ amountPaise: 999_00, expenseDate: "2026-11-21", category: null, groupId: "g2", description: "Wifi bill" }),
  expense({ amountPaise: 30000_00, expenseDate: "2026-10-01", category: "rent", payerId: M, description: "October rent" }),
  expense({
    amountPaise: 600_00,
    expenseDate: "2026-11-10",
    category: "dining",
    payerId: M,
    shares: [{ userId: M, sharePaise: 600_00 }],
    description: "Meera's dinner",
  }),
]

describe("summarizeMonth", () => {
  const summary = summarizeMonth(data, A, "2026-11-14")

  it("totals the selected month only", () => {
    expect(summary.monthStart).toBe("2026-11-01")
    expect(summary.count).toBe(5)
    expect(summary.totalPaise).toBe(30000_00 + 1250_50 + 450_00 + 999_00 + 600_00)
  })

  it("adds up my share and what I paid", () => {
    expect(summary.mySharePaise).toBe(15000_00 + 625_25 + 225_00 + 499_50)
    expect(summary.myPaidPaise).toBe(1250_50 + 999_00)
  })

  it("groups by category, biggest first, with uncategorised as other", () => {
    expect(summary.categories.map((item) => item.category)).toEqual(["rent", "groceries", "other", "dining"])
    expect(summary.categories[1]).toMatchObject({ totalPaise: 1700_50, count: 2 })
    expect(summary.categories.reduce((sum, item) => sum + item.totalPaise, 0)).toBe(summary.totalPaise)
  })

  it("ranks top payers and splits by group", () => {
    expect(summary.payers[0]).toMatchObject({ userId: M, paidPaise: 31050_00, count: 3 })
    expect(summary.payers[1]).toMatchObject({ userId: A, paidPaise: 2249_50, count: 2 })
    expect(summary.groups.map((group) => group.groupId)).toEqual(["g1", "g2"])
  })

  it("lists every month with spending, newest first", () => {
    expect(summary.months.map((month) => month.monthStart)).toEqual(["2026-11-01", "2026-10-01"])
    expect(summary.months[1].mySharePaise).toBe(15000_00)
  })

  it("returns an empty month without failing", () => {
    const empty = summarizeMonth(data, A, "2026-12-03")
    expect(empty).toMatchObject({ totalPaise: 0, mySharePaise: 0, count: 0, categories: [], payers: [] })
    expect(empty.months[0].monthStart).toBe("2026-12-01")
  })
})

describe("months", () => {
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01")
    expect(shiftMonth("2026-11-01", 2)).toBe("2027-01-01")
  })

  it("builds a fixed-length trend ending at the selected month", () => {
    const points = trend(summarizeMonth(data, A, "2026-11-01").months, "2026-11-01", 3)
    expect(points.map((point) => point.monthStart)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"])
    expect(points[0].totalPaise).toBe(0)
  })
})

describe("filterExpenses", () => {
  it("searches descriptions word by word, ignoring case", () => {
    expect(filterExpenses(data, { ...EMPTY_FILTERS, query: "RENT nov" }).map((item) => item.description)).toEqual(["November rent"])
  })

  it("filters by payer, by person involved, category and dates", () => {
    expect(filterExpenses(data, { ...EMPTY_FILTERS, paidBy: A })).toHaveLength(2)
    expect(filterExpenses(data, { ...EMPTY_FILTERS, involves: A }).map((item) => item.description)).not.toContain("Meera's dinner")
    expect(filterExpenses(data, { ...EMPTY_FILTERS, category: "other" }).map((item) => item.description)).toEqual(["Wifi bill"])
    expect(filterExpenses(data, { ...EMPTY_FILTERS, from: "2026-11-05", to: "2026-11-20" })).toHaveLength(3)
  })
})
