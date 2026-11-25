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

  it("lets a member share a single-use link that creates the account", async () => {
    const db = await import("@/lib/demo/db")
    const { path } = await db.createSignupLink(IDS.meera)
    const token = path.split("/").pop() as string
    expect((await db.previewSignupLink(token)).valid).toBe(true)
    await expect(db.redeemSignupLink(token, { name: "A", email: "x", password: "short" })).rejects.toThrow()
    const email = await db.redeemSignupLink(token, { name: "Riya Shah", email: "Riya@Hissa.app", password: "secret123" })
    const user = await db.authenticate(email, "secret123")
    expect(user.displayName).toBe("Riya Shah")
    expect((await db.previewSignupLink(token)).valid).toBe(false)
    await expect(
      db.redeemSignupLink(token, { name: "Riya Shah", email: "riya2@hissa.app", password: "secret123" }),
    ).rejects.toThrow(/invalid or already used/)
  })

  it("keeps the settled day open for new expenses and blocks future dates", async () => {
    const db = await import("@/lib/demo/db")
    const { todayISO } = await import("@/lib/money")
    const today = todayISO()
    const aarav = await db.authenticate("aarav@hissa.app", "demo1234")
    const base = {
      groupId: IDS.flat,
      payerId: aarav.id,
      category: "other" as const,
      shares: splitEqually(1000, [IDS.aarav, IDS.meera]),
      amountPaise: 1000,
    }
    const before = await db.saveExpense(aarav.id, { ...base, description: "Before settling", expenseDate: today })

    const settlementId = await db.requestSettlement(IDS.meera, {
      groupId: IDS.flat,
      toUserId: IDS.aarav,
      amountPaise: 500,
      upToDate: today,
    })
    await db.resolveSettlement(aarav.id, settlementId, true)

    // The expense that existed at approval is locked; today is otherwise still open.
    await expect(
      db.saveExpense(aarav.id, { ...base, id: before, description: "Edit", expenseDate: today }),
    ).rejects.toThrow(/locked/)
    const after = await db.saveExpense(aarav.id, { ...base, description: "After settling", expenseDate: today })
    await db.saveExpense(aarav.id, { ...base, id: after, description: "After, edited", expenseDate: today })
    const group = await db.getGroup(aarav.id, IDS.flat)
    expect(group?.expenses.find((e) => e.id === before)?.locked).toBe(true)
    expect(group?.expenses.find((e) => e.id === after)?.locked).toBe(false)
    await db.deleteExpense(aarav.id, after)

    // Yesterday is before the settled date, so it stays locked.
    const y = new Date()
    y.setDate(y.getDate() - 1)
    await expect(
      db.saveExpense(aarav.id, { ...base, description: "Yesterday", expenseDate: todayISO(y) }),
    ).rejects.toThrow(/locked/)

    // Dates after tomorrow are rejected (one day of slack for time zones).
    const f = new Date()
    f.setDate(f.getDate() + 3)
    await expect(
      db.saveExpense(aarav.id, { ...base, description: "Future", expenseDate: todayISO(f) }),
    ).rejects.toThrow(/future/)
  })

  it("creates an account from a group invite and puts them in the group", async () => {
    const db = await import("@/lib/demo/db")
    const email = await db.createInvitedUser({ name: "Tara Nair", email: "tara@hissa.app", password: "secret123" })
    await expect(
      db.createInvitedUser({ name: "Tara Nair", email: "TARA@hissa.app", password: "secret123" }),
    ).rejects.toThrow(/already exists/)
    const user = await db.authenticate(email, "secret123")
    const joined = await db.joinByCode(user.id, "flat4b7k")
    expect(joined.alreadyMember).toBe(false)
    const group = await db.getGroup(user.id, joined.groupId)
    expect(group?.members.map((member) => member.displayName)).toContain("Tara Nair")
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
