import { splitEqually } from "@/lib/ledger"
import type { Share } from "@/lib/types"

export const IDS = {
  aarav: "11111111-1111-4111-8111-111111111111",
  meera: "22222222-2222-4222-8222-222222222222",
  flat: "33333333-3333-4333-8333-333333333333",
  trip: "44444444-4444-4444-8444-444444444444",
} as const

export const DEMO_INVITES = {
  flat: "FLAT4B7K",
  trip: "TRIP9K2M",
} as const

type SeedExpense = {
  id: string
  groupId: string
  description: string
  amountPaise: number
  payerId: string
  expenseDate: string
  category: string
  createdBy: string
  createdAt: string
  updatedAt: string
  shares: Share[]
}

function expense(input: {
  n: number
  description: string
  rupees: number
  payerId: string
  expenseDate: string
  category: string
  shares?: Share[]
}): SeedExpense {
  const amountPaise = input.rupees * 100
  const shares =
    input.shares ??
    splitEqually(amountPaise, [IDS.aarav, IDS.meera]).map((share) => ({
      userId: share.userId,
      sharePaise: share.sharePaise,
    }))
  const createdAt = `${input.expenseDate}T${String(8 + input.n).padStart(2, "0")}:15:00.000Z`
  return {
    id: `55555555-5555-4555-8555-${String(input.n).padStart(12, "0")}`,
    groupId: IDS.flat,
    description: input.description,
    amountPaise,
    payerId: input.payerId,
    expenseDate: input.expenseDate,
    category: input.category,
    createdBy: input.payerId,
    createdAt,
    updatedAt: createdAt,
    shares,
  }
}

export function seedExpenses(): SeedExpense[] {
  return [
    expense({ n: 1, description: "October rent", rupees: 32000, payerId: IDS.aarav, expenseDate: "2026-10-01", category: "rent" }),
    expense({ n: 2, description: "Nature's Basket", rupees: 2460, payerId: IDS.meera, expenseDate: "2026-10-06", category: "groceries" }),
    expense({ n: 3, description: "Fibre internet", rupees: 999, payerId: IDS.aarav, expenseDate: "2026-10-12", category: "utilities" }),
    expense({ n: 4, description: "Cafe Madras", rupees: 1800, payerId: IDS.meera, expenseDate: "2026-10-18", category: "dining" }),
    expense({ n: 5, description: "November rent", rupees: 32000, payerId: IDS.aarav, expenseDate: "2026-11-01", category: "rent" }),
    expense({ n: 6, description: "Weekly groceries", rupees: 3120, payerId: IDS.meera, expenseDate: "2026-11-04", category: "groceries" }),
    expense({ n: 7, description: "Electricity", rupees: 2480, payerId: IDS.aarav, expenseDate: "2026-11-07", category: "utilities" }),
    expense({ n: 8, description: "Floor cleaner and bulbs", rupees: 860, payerId: IDS.meera, expenseDate: "2026-11-09", category: "household" }),
    expense({ n: 9, description: "Cab from the airport", rupees: 640, payerId: IDS.aarav, expenseDate: "2026-11-11", category: "transport" }),
    expense({
      n: 10,
      description: "Dinner at O Pedro",
      rupees: 2150,
      payerId: IDS.meera,
      expenseDate: "2026-11-13",
      category: "dining",
      shares: [
        { userId: IDS.aarav, sharePaise: 140000 },
        { userId: IDS.meera, sharePaise: 75000 },
      ],
    }),
  ]
}

export function buildSeedLedger() {
  const expenses = seedExpenses()
  return {
    aaravId: IDS.aarav,
    meeraId: IDS.meera,
    memberIds: [IDS.aarav, IDS.meera],
    expenses: expenses.map((expense) => ({
      payerId: expense.payerId,
      expenseDate: expense.expenseDate,
      amountPaise: expense.amountPaise,
      shares: expense.shares,
    })),
    settlements: [
      {
        fromUserId: IDS.meera,
        toUserId: IDS.aarav,
        amountPaise: 1_200_000,
        status: "approved" as const,
        upToDate: "2026-10-31",
      },
      {
        fromUserId: IDS.meera,
        toUserId: IDS.aarav,
        amountPaise: 800_000,
        status: "pending" as const,
        upToDate: "2026-11-10",
      },
    ],
  }
}
