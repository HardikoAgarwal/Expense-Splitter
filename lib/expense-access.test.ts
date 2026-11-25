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

  it("lets a group admin step in only when the creator has left", () => {
    expect(canModifyExpense({ createdBy: "a" }, "b", { creatorLeft: true, isGroupAdmin: true })).toBe(true)
    expect(canModifyExpense({ createdBy: "a" }, "b", { creatorLeft: true, isGroupAdmin: false })).toBe(false)
    expect(canModifyExpense({ createdBy: "a" }, "b", { creatorLeft: false, isGroupAdmin: true })).toBe(false)
  })
})
