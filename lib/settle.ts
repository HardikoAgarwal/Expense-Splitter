import type { Settlement } from "@/lib/types"

export type SettleBreakdown = {
  /** Who owes whom, from the approved ledger through the chosen date. */
  direction: "i-owe" | "they-owe" | "square"
  /** Approved balance between the two people, always positive. */
  owedPaise: number
  /** Payments recorded towards that balance that are still waiting for approval. */
  pendingPaise: number
  /** What is left once the pending payments are approved. Never negative. */
  remainingPaise: number
}

/**
 * Combines the approved balance with payments still waiting for approval, so the
 * settle-up screen can show Owe / Paid (pending) / Remaining in one place.
 * `iOwePaise` is positive when I owe them and negative when they owe me.
 */
export function settleBreakdown(iOwePaise: number, settlements: Settlement[], me: string, other: string): SettleBreakdown {
  const direction = iOwePaise > 0 ? "i-owe" : iOwePaise < 0 ? "they-owe" : "square"
  const [from, to] = direction === "they-owe" ? [other, me] : [me, other]
  const pendingPaise = settlements
    .filter((item) => item.status === "pending" && item.fromUserId === from && item.toUserId === to)
    .reduce((sum, item) => sum + item.amountPaise, 0)
  const owedPaise = Math.abs(iOwePaise)
  return { direction, owedPaise, pendingPaise, remainingPaise: Math.max(0, owedPaise - pendingPaise) }
}
