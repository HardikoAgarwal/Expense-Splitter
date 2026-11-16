import { describe, expect, it } from "vitest"
import { disputedExpensesInRange, flagBlockReason, resolveFlagBlockReason } from "@/lib/disputes"
import type { Expense } from "@/lib/types"

describe("dispute permissions", () => {
  it("lets only a person with a positive share flag an expense", () => {
    expect(flagBlockReason(25000)).toBeNull()
    expect(flagBlockReason(0)).toMatch(/share/)
    expect(flagBlockReason(-1)).toMatch(/share/)
  })

  it("lets the flagger or the creator resolve, and nobody else", () => {
    expect(resolveFlagBlockReason({ actorId: "meera", flaggerId: "meera", creatorId: "aarav" })).toBeNull()
    expect(resolveFlagBlockReason({ actorId: "aarav", flaggerId: "meera", creatorId: "aarav" })).toBeNull()
    expect(resolveFlagBlockReason({ actorId: "kabir", flaggerId: "meera", creatorId: "aarav" })).toMatch(/flagged/)
  })

  it("finds disputed expenses inside a settle-up range", () => {
    const expenses = [
      expense("groceries", "2026-11-02", true),
      expense("rent", "2026-11-20", true),
      expense("dinner", "2026-11-01", false),
    ]
    expect(disputedExpensesInRange(expenses, "2026-11-10").map((item) => item.description)).toEqual(["groceries"])
  })
})

function expense(description: string, expenseDate: string, disputed: boolean): Expense {
  return {
    id: description,
    groupId: "g",
    description,
    amountPaise: 100,
    payerId: "a",
    expenseDate,
    category: null,
    createdBy: "a",
    createdAt: expenseDate,
    updatedAt: expenseDate,
    shares: [],
    locked: false,
    disputed,
    flags: [],
  }
}
