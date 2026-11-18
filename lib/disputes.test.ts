import { describe, expect, it } from "vitest"

import {
  disputedExpensesInRange,
  disputeNeedsMe,
  disputeRole,
  flagBlockReason,
  requestResolveBlockReason,
  resolveFlagBlockReason,
  stillWrongBlockReason,
  updatedSinceRaised,
} from "@/lib/disputes"
import type { Expense, ExpenseFlag } from "@/lib/types"

const owner = { createdBy: "aarav", payerId: "aarav" }
const flag = (awaiting: ExpenseFlag["awaiting"], events: ExpenseFlag["events"] = []): ExpenseFlag => ({
  id: "f",
  userId: "meera",
  reason: "I wasn't there",
  createdAt: "2026-11-10T10:00:00.000Z",
  awaiting,
  events,
})

describe("who can do what in a dispute", () => {
  it("lets someone with a share flag, but not the person who added it", () => {
    expect(flagBlockReason({ sharePaise: 25000, actorId: "meera", creatorId: "aarav" })).toBeNull()
    expect(flagBlockReason({ sharePaise: 0, actorId: "meera", creatorId: "aarav" })).toMatch(/share/)
    expect(flagBlockReason({ sharePaise: 25000, actorId: "aarav", creatorId: "aarav" })).toMatch(/Edit it/)
  })

  it("lets only the flagger resolve", () => {
    expect(resolveFlagBlockReason({ actorId: "meera", flaggerId: "meera" })).toBeNull()
    expect(resolveFlagBlockReason({ actorId: "aarav", flaggerId: "meera" })).toMatch(/flagged/)
    expect(resolveFlagBlockReason({ actorId: "kabir", flaggerId: "meera" })).toMatch(/flagged/)
  })

  it("lets only the flagger say still wrong, and only after being asked", () => {
    expect(stillWrongBlockReason({ actorId: "meera", flaggerId: "meera", awaiting: "flagger" })).toBeNull()
    expect(stillWrongBlockReason({ actorId: "meera", flaggerId: "meera", awaiting: "owner" })).toMatch(/haven't asked/)
    expect(stillWrongBlockReason({ actorId: "aarav", flaggerId: "meera", awaiting: "flagger" })).toMatch(/flagged/)
  })

  it("lets the creator or payer ask once per round", () => {
    const base = { creatorId: "aarav", payerId: "kabir" }
    expect(requestResolveBlockReason({ ...base, actorId: "aarav", awaiting: "owner" })).toBeNull()
    expect(requestResolveBlockReason({ ...base, actorId: "kabir", awaiting: "owner" })).toBeNull()
    expect(requestResolveBlockReason({ ...base, actorId: "meera", awaiting: "owner" })).toMatch(/added or paid/)
    expect(requestResolveBlockReason({ ...base, actorId: "aarav", awaiting: "flagger" })).toMatch(/Already asked/)
  })
})

describe("whose move it is", () => {
  it("puts an open flag on the owner and a request on the flagger", () => {
    expect(disputeRole(flag("owner"), owner, "meera")).toBe("flagger")
    expect(disputeRole(flag("owner"), owner, "aarav")).toBe("owner")
    expect(disputeRole(flag("owner"), owner, "kabir")).toBeNull()
    expect(disputeNeedsMe(flag("owner"), owner, "aarav")).toBe(true)
    expect(disputeNeedsMe(flag("owner"), owner, "meera")).toBe(false)
    expect(disputeNeedsMe(flag("flagger"), owner, "meera")).toBe(true)
    expect(disputeNeedsMe(flag("flagger"), owner, "aarav")).toBe(false)
    expect(disputeNeedsMe(flag("owner"), { createdBy: "aarav", payerId: "kabir" }, "kabir")).toBe(true)
  })

  it("notices an edit made after the dispute was last raised", () => {
    const events: ExpenseFlag["events"] = [
      { id: "1", kind: "flagged", actorId: "meera", note: null, createdAt: "2026-11-10T10:00:00.000Z" },
      { id: "2", kind: "resolve_requested", actorId: "aarav", note: null, createdAt: "2026-11-11T10:00:00.000Z" },
      { id: "3", kind: "still_wrong", actorId: "meera", note: "Still 3 people", createdAt: "2026-11-12T10:00:00.000Z" },
    ]
    expect(updatedSinceRaised(flag("owner", events), "2026-11-11T12:00:00.000Z")).toBe(false)
    expect(updatedSinceRaised(flag("owner", events), "2026-11-12T12:00:00.000Z")).toBe(true)
  })
})

describe("settle-up range", () => {
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
