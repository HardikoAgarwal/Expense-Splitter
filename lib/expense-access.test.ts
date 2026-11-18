import { describe, expect, it } from "vitest"

import { canModifyExpense } from "@/lib/expense-access"

describe("canModifyExpense", () => {
  it("allows only the creator", () => {
    expect(canModifyExpense({ createdBy: "a" }, "a")).toBe(true)
    expect(canModifyExpense({ createdBy: "a" }, "b")).toBe(false)
  })

  it("rejects missing data", () => {
    expect(canModifyExpense(null, "a")).toBe(false)
    expect(canModifyExpense({ createdBy: "a" }, "")).toBe(false)
  })
})
