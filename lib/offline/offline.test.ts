import { describe, expect, it } from "vitest"

import { applyOutboxToGroup, isClientExpenseId, newClientExpenseId } from "@/lib/offline/store"
import type { OutboxItem } from "@/lib/offline/types"
import type { GroupDetail } from "@/lib/types"

const AARAV = "11111111-1111-4111-8111-111111111111"
const MEERA = "22222222-2222-4222-8222-222222222222"

function sampleGroup(expenses: GroupDetail["expenses"] = []): GroupDetail {
  return {
    id: "group-1",
    name: "Flat",
    createdBy: AARAV,
    members: [
      { id: AARAV, displayName: "Aarav", email: "a@hissa.app", role: "admin" },
      { id: MEERA, displayName: "Meera", email: "m@hissa.app", role: "member" },
    ],
    formerMembers: [],
    expenses,
    balances: [
      { userId: AARAV, paidPaise: 0, owedPaise: 0, settlementsPaidPaise: 0, settlementsReceivedPaise: 0, netPaise: 0 },
      { userId: MEERA, paidPaise: 0, owedPaise: 0, settlementsPaidPaise: 0, settlementsReceivedPaise: 0, netPaise: 0 },
    ],
    debts: [],
    settlements: [],
    myNetPaise: 0,
    lockDate: null,
    myRole: "admin",
  }
}

describe("offline helpers", () => {
  it("tags client expense ids", () => {
    const id = newClientExpenseId()
    expect(isClientExpenseId(id)).toBe(true)
    expect(isClientExpenseId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toBe(false)
  })

  it("applies a pending save into local balances before sync", () => {
    const clientId = "offline-test-milk"
    const outbox: OutboxItem[] = [
      {
        id: "outbox-1",
        kind: "save",
        expenseId: clientId,
        groupId: "group-1",
        payload: {
          groupId: "group-1",
          description: "Milk",
          amountPaise: 10000,
          payerId: AARAV,
          expenseDate: "2026-11-20",
          category: "groceries",
          shares: [
            { userId: AARAV, sharePaise: 5000 },
            { userId: MEERA, sharePaise: 5000 },
          ],
          clientMutationId: clientId,
        },
        createdAt: "2026-11-20T10:00:00.000Z",
        attempts: 0,
        lastError: null,
        label: "Milk",
      },
    ]

    const merged = applyOutboxToGroup(sampleGroup(), outbox, AARAV)
    expect(merged.expenses).toHaveLength(1)
    expect(merged.expenses[0].id).toBe(clientId)
    expect(merged.expenses[0].description).toBe("Milk")
    expect(merged.myNetPaise).toBe(5000)
    expect(merged.debts).toEqual([{ fromUserId: MEERA, toUserId: AARAV, amountPaise: 5000 }])
  })

  it("applies a pending delete onto cached expenses", () => {
    const group = sampleGroup([
      {
        id: "exp-1",
        groupId: "group-1",
        description: "Tea",
        amountPaise: 2000,
        payerId: AARAV,
        expenseDate: "2026-11-18",
        category: "dining",
        createdBy: AARAV,
        createdAt: "2026-11-18T10:00:00.000Z",
        updatedAt: "2026-11-18T10:00:00.000Z",
        shares: [
          { userId: AARAV, sharePaise: 1000 },
          { userId: MEERA, sharePaise: 1000 },
        ],
        locked: false,
        disputed: false,
        flags: [],
      },
    ])
    const outbox: OutboxItem[] = [
      {
        id: "outbox-del",
        kind: "delete",
        expenseId: "exp-1",
        groupId: "group-1",
        payload: null,
        createdAt: "2026-11-20T10:00:00.000Z",
        attempts: 0,
        lastError: null,
        label: "Tea",
      },
    ]
    const merged = applyOutboxToGroup(group, outbox, AARAV)
    expect(merged.expenses).toHaveLength(0)
    expect(merged.myNetPaise).toBe(0)
  })
})
