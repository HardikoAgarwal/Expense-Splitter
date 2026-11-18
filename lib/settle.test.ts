import { describe, expect, it } from "vitest"

import { settleBreakdown } from "@/lib/settle"
import type { Settlement } from "@/lib/types"

function settlement(partial: Partial<Settlement> & { fromUserId: string; toUserId: string; amountPaise: number }): Settlement {
  return {
    id: Math.random().toString(36).slice(2),
    groupId: "g",
    upToDate: "2026-11-18",
    status: "pending",
    createdBy: partial.fromUserId,
    createdAt: "2026-11-18T00:00:00Z",
    resolvedAt: null,
    ...partial,
  }
}

describe("settleBreakdown", () => {
  it("subtracts my pending payments from what I owe", () => {
    const result = settleBreakdown(10000, [settlement({ fromUserId: "me", toUserId: "them", amountPaise: 4000 })], "me", "them")
    expect(result).toEqual({ direction: "i-owe", owedPaise: 10000, pendingPaise: 4000, remainingPaise: 6000 })
  })

  it("ignores approved, rejected and unrelated settlements", () => {
    const result = settleBreakdown(
      10000,
      [
        settlement({ fromUserId: "me", toUserId: "them", amountPaise: 1000, status: "approved" }),
        settlement({ fromUserId: "me", toUserId: "them", amountPaise: 1000, status: "rejected" }),
        settlement({ fromUserId: "me", toUserId: "else", amountPaise: 1000 }),
        settlement({ fromUserId: "them", toUserId: "me", amountPaise: 1000 }),
      ],
      "me",
      "them",
    )
    expect(result.pendingPaise).toBe(0)
    expect(result.remainingPaise).toBe(10000)
  })

  it("never goes below zero when more is pending than owed", () => {
    const result = settleBreakdown(3000, [settlement({ fromUserId: "me", toUserId: "them", amountPaise: 5000 })], "me", "them")
    expect(result.remainingPaise).toBe(0)
  })

  it("counts their pending payments when they owe me", () => {
    const result = settleBreakdown(-8000, [settlement({ fromUserId: "them", toUserId: "me", amountPaise: 8000 })], "me", "them")
    expect(result).toEqual({ direction: "they-owe", owedPaise: 8000, pendingPaise: 8000, remainingPaise: 0 })
  })

  it("reports square balances", () => {
    expect(settleBreakdown(0, [], "me", "them").direction).toBe("square")
  })
})
