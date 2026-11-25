import { describe, expect, it } from "vitest"
import { formatINR, rupeesToPaise } from "@/lib/money"
import {
  computeBalances,
  lockDate,
  pairwiseIOwe,
  simplifyDebts,
  splitEqually,
  validateShares,
} from "@/lib/ledger"
import { buildSeedLedger } from "@/lib/demo/seed-data"

describe("rupeesToPaise", () => {
  it("parses rupees without floats", () => {
    expect(rupeesToPaise("500")).toBe(50000)
    expect(rupeesToPaise("200.1")).toBe(20010)
    expect(rupeesToPaise("200.10")).toBe(20010)
    expect(rupeesToPaise("0.01")).toBe(1)
    expect(rupeesToPaise("1,200")).toBe(120000)
  })

  it("rejects junk and more than two decimals", () => {
    expect(rupeesToPaise("")).toBeNull()
    expect(rupeesToPaise("12.345")).toBeNull()
    expect(rupeesToPaise("abc")).toBeNull()
    expect(rupeesToPaise("-5")).toBeNull()
  })
})

describe("formatINR", () => {
  it("formats Indian grouping and drops empty paise", () => {
    expect(formatINR(1653950)).toBe("₹16,539.50")
    expect(formatINR(3200000)).toBe("₹32,000")
    expect(formatINR(-50000, { signed: true })).toBe("−₹500")
    expect(formatINR(50000, { signed: true })).toBe("+₹500")
  })
})

describe("splitEqually", () => {
  it("splits an even total", () => {
    expect(splitEqually(50000, ["b", "a"])).toEqual([
      { userId: "a", sharePaise: 25000 },
      { userId: "b", sharePaise: 25000 },
    ])
  })

  it("gives leftover paise to the first sorted ids", () => {
    const shares = splitEqually(500, ["c", "a", "b"])
    expect(shares).toEqual([
      { userId: "a", sharePaise: 167 },
      { userId: "b", sharePaise: 167 },
      { userId: "c", sharePaise: 166 },
    ])
    expect(shares.reduce((sum, share) => sum + share.sharePaise, 0)).toBe(500)
  })

  it("is stable when the input order changes", () => {
    expect(splitEqually(100, ["b", "a", "c"])).toEqual(splitEqually(100, ["c", "b", "a"]))
  })

  it("rejects an empty group", () => {
    expect(() => splitEqually(100, [])).toThrow(/at least one/)
  })
})

describe("validateShares", () => {
  it("accepts a custom 200 / 200 / 100 split of 500 rupees", () => {
    const total = rupeesToPaise("500")!
    const shares = [
      { userId: "a", sharePaise: rupeesToPaise("200")! },
      { userId: "b", sharePaise: rupeesToPaise("200")! },
      { userId: "c", sharePaise: rupeesToPaise("100")! },
    ]
    expect(validateShares(total, shares)).toBeNull()
  })

  it("rejects a short or over split", () => {
    expect(validateShares(50000, [{ userId: "a", sharePaise: 40000 }])).toMatch(/short/)
    expect(
      validateShares(50000, [
        { userId: "a", sharePaise: 30000 },
        { userId: "b", sharePaise: 30000 },
      ]),
    ).toMatch(/over/)
  })
})

describe("simplifyDebts", () => {
  it("matches the largest debtor with the largest creditor", () => {
    expect(
      simplifyDebts([
        { userId: "a", netPaise: 500 },
        { userId: "b", netPaise: 200 },
        { userId: "c", netPaise: -700 },
      ]),
    ).toEqual([
      { fromUserId: "c", toUserId: "a", amountPaise: 500 },
      { fromUserId: "c", toUserId: "b", amountPaise: 200 },
    ])
  })

  it("settles two people in one payment", () => {
    expect(
      simplifyDebts([
        { userId: "aarav", netPaise: 1653950 },
        { userId: "meera", netPaise: -1653950 },
      ]),
    ).toEqual([{ fromUserId: "meera", toUserId: "aarav", amountPaise: 1653950 }])
  })

  it("breaks ties by user id", () => {
    expect(
      simplifyDebts([
        { userId: "b", netPaise: 100 },
        { userId: "a", netPaise: 100 },
        { userId: "c", netPaise: -200 },
      ]),
    ).toEqual([
      { fromUserId: "c", toUserId: "a", amountPaise: 100 },
      { fromUserId: "c", toUserId: "b", amountPaise: 100 },
    ])
  })

  it("returns nothing when everyone is square", () => {
    expect(
      simplifyDebts([
        { userId: "a", netPaise: 0 },
        { userId: "b", netPaise: 0 },
      ]),
    ).toEqual([])
  })
})

describe("balances", () => {
  it("nets paid minus share, then approved settlements only", () => {
    const balances = computeBalances(
      ["a", "b"],
      [
        {
          payerId: "a",
          expenseDate: "2026-11-01",
          amountPaise: 10000,
          shares: [
            { userId: "a", sharePaise: 5000 },
            { userId: "b", sharePaise: 5000 },
          ],
        },
      ],
      [
        {
          fromUserId: "b",
          toUserId: "a",
          amountPaise: 5000,
          status: "pending",
          upToDate: "2026-11-01",
        },
      ],
    )
    expect(balances.find((balance) => balance.userId === "a")?.netPaise).toBe(5000)
    expect(balances.find((balance) => balance.userId === "b")?.netPaise).toBe(-5000)

    const settled = computeBalances(
      ["a", "b"],
      [
        {
          payerId: "a",
          expenseDate: "2026-11-01",
          amountPaise: 10000,
          shares: [
            { userId: "a", sharePaise: 5000 },
            { userId: "b", sharePaise: 5000 },
          ],
        },
      ],
      [
        {
          fromUserId: "b",
          toUserId: "a",
          amountPaise: 5000,
          status: "approved",
          upToDate: "2026-11-01",
        },
      ],
    )
    expect(settled.every((balance) => balance.netPaise === 0)).toBe(true)
  })

  it("matches the seeded flat", () => {
    const ledger = buildSeedLedger()
    const balances = computeBalances(ledger.memberIds, ledger.expenses, ledger.settlements)
    const aarav = balances.find((balance) => balance.userId === ledger.aaravId)
    const meera = balances.find((balance) => balance.userId === ledger.meeraId)
    expect(aarav?.netPaise).toBe(1_653_950)
    expect(meera?.netPaise).toBe(-1_653_950)
    expect(simplifyDebts(balances)).toEqual([
      { fromUserId: ledger.meeraId, toUserId: ledger.aaravId, amountPaise: 1_653_950 },
    ])
    expect(
      pairwiseIOwe({
        me: ledger.meeraId,
        other: ledger.aaravId,
        upToDate: "2026-11-15",
        expenses: ledger.expenses,
        settlements: ledger.settlements,
      }),
    ).toBe(1_653_950)
  })
})

const FOUR = ["a", "b", "c", "d"]

describe("subset splits", () => {
  it("splits ₹1000 only between the payer and one other person", () => {
    const shares = splitEqually(100_000, ["a", "b"])
    const balances = computeBalances(
      FOUR,
      [{ payerId: "a", expenseDate: "2026-11-01", amountPaise: 100_000, shares }],
      [],
    )
    expect(net(balances, "a")).toBe(50_000)
    expect(net(balances, "b")).toBe(-50_000)
    expect(net(balances, "c")).toBe(0)
    expect(net(balances, "d")).toBe(0)
    expect(simplifyDebts(balances)).toEqual([{ fromUserId: "b", toUserId: "a", amountPaise: 50_000 }])
  })

  it("lets the payer stay out of the split", () => {
    const shares = splitEqually(60_000, ["b", "c"])
    const balances = computeBalances(
      FOUR,
      [{ payerId: "a", expenseDate: "2026-11-02", amountPaise: 60_000, shares }],
      [],
    )
    expect(net(balances, "a")).toBe(60_000)
    expect(net(balances, "b")).toBe(-30_000)
    expect(net(balances, "c")).toBe(-30_000)
    expect(net(balances, "d")).toBe(0)
  })

  it("gives the leftover paisa to the first of three people in a group of four", () => {
    const shares = splitEqually(10_000, ["d", "b", "a"])
    expect(shares).toEqual([
      { userId: "a", sharePaise: 3334 },
      { userId: "b", sharePaise: 3333 },
      { userId: "d", sharePaise: 3333 },
    ])
    expect(validateShares(10_000, shares)).toBeNull()
    expect(validateShares(10_000, [...shares, { userId: "c", sharePaise: 0 }])).toBeNull()
    expect(validateShares(10_000, [{ userId: "a", sharePaise: 0 }])).toMatch(/Choose who/)
  })

  it("keeps a mix of subset expenses at zero and settles everyone", () => {
    const expenses = [
      {
        payerId: "a",
        expenseDate: "2026-11-01",
        amountPaise: 100_000,
        shares: splitEqually(100_000, ["a", "b"]),
      },
      {
        payerId: "a",
        expenseDate: "2026-11-02",
        amountPaise: 60_000,
        shares: splitEqually(60_000, ["b", "c"]),
      },
      {
        payerId: "d",
        expenseDate: "2026-11-03",
        amountPaise: 40_000,
        shares: splitEqually(40_000, FOUR),
      },
    ]
    const balances = computeBalances(FOUR, expenses, [])
    expect(balances.reduce((sum, balance) => sum + balance.netPaise, 0)).toBe(0)
    const transfers = simplifyDebts(balances)
    const settled = computeBalances(
      FOUR,
      expenses,
      transfers.map((transfer) => ({
        fromUserId: transfer.fromUserId,
        toUserId: transfer.toUserId,
        amountPaise: transfer.amountPaise,
        status: "approved" as const,
        upToDate: "2026-11-03",
      })),
    )
    expect(settled.every((balance) => balance.netPaise === 0)).toBe(true)
  })
})

function net(balances: { userId: string; netPaise: number }[], userId: string) {
  return balances.find((balance) => balance.userId === userId)?.netPaise
}

describe("write-offs", () => {
  it("count toward balances but never lock dates", () => {
    const settlements = [
      { fromUserId: "m", toUserId: "a", amountPaise: 500, status: "approved" as const, upToDate: "2026-11-20", writeOff: true },
    ]
    expect(lockDate(settlements)).toBeNull()
    const [a, m] = computeBalances(
      ["a", "m"],
      [{ payerId: "a", expenseDate: "2026-11-01", amountPaise: 1000, shares: [{ userId: "a", sharePaise: 500 }, { userId: "m", sharePaise: 500 }] }],
      settlements,
    )
    expect(a.netPaise).toBe(0)
    expect(m.netPaise).toBe(0)
  })
})
