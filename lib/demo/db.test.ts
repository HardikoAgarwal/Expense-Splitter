import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { IDS } from "@/lib/demo/seed-data"
import { splitEqually } from "@/lib/ledger"

describe("demo ledger rules", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "hissa-"))
    process.env.HISSA_DEMO_DB = path.join(dir, "db.json")
  })

  afterEach(async () => {
    delete process.env.HISSA_DEMO_DB
    await rm(dir, { recursive: true, force: true })
  })

  it("seeds the flat, rejects a bad split, and locks settled dates", async () => {
    const db = await import("@/lib/demo/db")
    const aarav = await db.authenticate("aarav@hissa.app", "demo1234")
    const group = await db.getGroup(aarav.id, IDS.flat)
    expect(group?.myNetPaise).toBe(1_653_950)
    expect(group?.lockDate).toBe("2026-10-31")

    await expect(
      db.saveExpense(aarav.id, {
        groupId: IDS.flat,
        description: "Bad split",
        amountPaise: 50000,
        payerId: aarav.id,
        expenseDate: "2026-11-15",
        category: "other",
        shares: [
          { userId: IDS.aarav, sharePaise: 20000 },
          { userId: IDS.meera, sharePaise: 20000 },
        ],
      }),
    ).rejects.toThrow(/short/)

    await expect(
      db.saveExpense(aarav.id, {
        groupId: IDS.flat,
        description: "Old rent tweak",
        amountPaise: 100,
        payerId: aarav.id,
        expenseDate: "2026-10-02",
        category: "rent",
        shares: splitEqually(100, [IDS.aarav, IDS.meera]),
      }),
    ).rejects.toThrow(/locked/)

    const id = await db.saveExpense(aarav.id, {
      groupId: IDS.flat,
      description: "Milk",
      amountPaise: 9000,
      payerId: aarav.id,
      expenseDate: "2026-11-15",
      category: "groceries",
      shares: splitEqually(9000, [IDS.aarav, IDS.meera]),
    })
    const after = await db.getGroup(aarav.id, IDS.flat)
    expect(after?.expenses.some((expense) => expense.id === id)).toBe(true)
    expect(after?.myNetPaise).toBe(1_653_950 + 4500)

    const pendingBefore = after?.myNetPaise
    const settlementId = await db.requestSettlement(IDS.meera, {
      groupId: IDS.flat,
      toUserId: IDS.aarav,
      amountPaise: 4500,
      upToDate: "2026-11-15",
    })
    const still = await db.getGroup(aarav.id, IDS.flat)
    expect(still?.myNetPaise).toBe(pendingBefore)
    await db.resolveSettlement(aarav.id, settlementId, true)
    const settled = await db.getGroup(aarav.id, IDS.flat)
    expect(settled?.myNetPaise).toBe((pendingBefore ?? 0) - 4500)
    expect(settled?.lockDate).toBe("2026-11-15")
  })

  it("expires invites and lets a new roommate join a live code", async () => {
    const db = await import("@/lib/demo/db")
    const expired = await db.previewInvite(null, "NOPE")
    expect(expired.valid).toBe(false)

    const aarav = await db.authenticate("aarav@hissa.app", "demo1234")
    expect(aarav.isAdmin).toBe(true)
    await expect(
      db.createAccount(IDS.meera, { email: "nope@hissa.app", displayName: "Nope" }),
    ).rejects.toThrow(/admin/)

    const created = await db.createAccount(aarav.id, {
      email: "kabir@hissa.app",
      displayName: "Kabir Das",
    })
    const roommate = await db.authenticate(created.email, created.temporaryPassword)
    await db.setUserDisabled(aarav.id, roommate.id, true)
    await expect(db.authenticate(created.email, created.temporaryPassword)).rejects.toThrow(/disabled/)
    await db.setUserDisabled(aarav.id, roommate.id, false)
    await expect(db.removeUser(aarav.id, aarav.id)).rejects.toThrow(/own access/)

    const joined = await db.joinByCode(roommate.id, "flat4b7k")
    expect(joined.alreadyMember).toBe(false)
    const group = await db.getGroup(roommate.id, joined.groupId)
    expect(group?.members.map((member) => member.displayName).sort()).toEqual([
      "Aarav Mehta",
      "Kabir Das",
      "Meera Shah",
    ])
  })
})
