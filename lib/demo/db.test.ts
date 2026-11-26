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

    // Timestamps are millisecond precise; keep "before" and "after" clearly apart.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5))
    await tick()
    const settlementId = await db.requestSettlement(IDS.meera, {
      groupId: IDS.flat,
      toUserId: IDS.aarav,
      amountPaise: 500,
      upToDate: today,
    })
    await db.resolveSettlement(aarav.id, settlementId, true)
    await tick()

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

  it("lets a settled-up member leave, keeps their history, and freezes expenses they were in", async () => {
    const db = await import("@/lib/demo/db")
    const { todayISO } = await import("@/lib/money")
    const aarav = await db.authenticate("aarav@hissa.app", "demo1234")
    const meera = await db.authenticate("meera@hissa.app", "demo1234")

    // Meera owes money, so she cannot leave and Aarav cannot remove her.
    await expect(db.leaveGroup(meera.id, IDS.flat)).rejects.toThrow(/still owe/)
    await expect(db.removeMember(aarav.id, IDS.flat, meera.id)).rejects.toThrow(/still owe/)
    // The only admin cannot leave while others remain.
    await expect(db.leaveGroup(aarav.id, IDS.flat)).rejects.toThrow()
    // Members cannot remove each other.
    await expect(db.removeMember(meera.id, IDS.flat, aarav.id)).rejects.toThrow(/admin/)

    // Aarav approves the payment already waiting in the seed data, then Meera pays the rest.
    const seeded = (await db.getGroup(meera.id, IDS.flat))?.settlements.find((item) => item.status === "pending")
    if (seeded) await db.resolveSettlement(aarav.id, seeded.id, true)
    // An expense Aarav adds with Meera in it; it must freeze once she leaves.
    const sharedId = await db.saveExpense(aarav.id, {
      groupId: IDS.flat,
      description: "Shared snack",
      amountPaise: 2000,
      payerId: aarav.id,
      expenseDate: todayISO(),
      category: "other",
      shares: splitEqually(2000, [IDS.aarav, IDS.meera]),
    })
    const before = await db.getGroup(meera.id, IDS.flat)
    const owed = -(before?.myNetPaise ?? 0)
    expect(owed).toBeGreaterThan(0)
    const settlementId = await db.requestSettlement(meera.id, {
      groupId: IDS.flat,
      toUserId: aarav.id,
      amountPaise: owed,
      upToDate: todayISO(),
    })
    await expect(db.leaveGroup(meera.id, IDS.flat)).rejects.toThrow(/waiting for approval|still owe/)
    await db.resolveSettlement(aarav.id, settlementId, true)

    await db.leaveGroup(meera.id, IDS.flat)

    // She is out: no access, not in the member list, but her name stays on old expenses.
    expect(await db.getGroup(meera.id, IDS.flat)).toBeNull()
    const after = await db.getGroup(aarav.id, IDS.flat)
    expect(after?.members.map((member) => member.displayName)).not.toContain("Meera Shah")
    expect(after?.formerMembers.map((member) => member.displayName)).toEqual(["Meera Shah"])
    const involved = after?.expenses.filter((expense) => expense.leftMember === "Meera Shah") ?? []
    expect(involved.length).toBeGreaterThan(0)
    expect(involved.some((expense) => expense.id === sharedId)).toBe(true)
    await expect(db.deleteExpense(aarav.id, sharedId)).rejects.toThrow(/left the group/)

    // She can come back with the invite code and is a normal member again.
    const rejoined = await db.joinByCode(meera.id, "flat4b7k")
    expect(rejoined.alreadyMember).toBe(false)
    const back = await db.getGroup(aarav.id, IDS.flat)
    expect(back?.formerMembers).toHaveLength(0)
    expect(back?.members.map((member) => member.displayName)).toContain("Meera Shah")
  })

  it("lets an admin remove someone with a balance by writing it off, and edit what they added", async () => {
    const db = await import("@/lib/demo/db")
    const { todayISO } = await import("@/lib/money")
    const aarav = await db.authenticate("aarav@hissa.app", "demo1234")
    const meera = await db.authenticate("meera@hissa.app", "demo1234")

    // An expense Meera adds that only involves Aarav, so it outlives her.
    const orphanId = await db.saveExpense(meera.id, {
      groupId: IDS.flat,
      description: "Gas refill",
      amountPaise: 5000,
      payerId: aarav.id,
      expenseDate: todayISO(),
      category: "utilities",
      shares: [{ userId: IDS.aarav, sharePaise: 5000 }],
    })

    const before = await db.getGroup(aarav.id, IDS.flat)
    const owed = -(before?.balances.find((b) => b.userId === IDS.meera)?.netPaise ?? 0)
    expect(owed).toBeGreaterThan(0)
    const aaravBefore = before?.myNetPaise ?? 0
    const lockBefore = before?.lockDate

    // Members cannot write off, and nobody writes off their own balance.
    await expect(db.removeMember(meera.id, IDS.flat, aarav.id, true)).rejects.toThrow(/admin/)
    await expect(db.removeMember(aarav.id, IDS.flat, aarav.id, true)).rejects.toThrow()
    // Without the write-off flag the balance still blocks removal.
    await expect(db.removeMember(aarav.id, IDS.flat, meera.id)).rejects.toThrow(/still owe/)

    await db.removeMember(aarav.id, IDS.flat, meera.id, true)
    const after = await db.getGroup(aarav.id, IDS.flat)

    // Aarav is the only one owed, so he absorbs exactly what Meera owed; nothing else moves.
    expect(after?.myNetPaise).toBe(aaravBefore - owed)
    expect(after?.myNetPaise).toBe(0)
    expect(after?.lockDate).toBe(lockBefore)
    const writeOffs = after?.settlements.filter((item) => item.writeOff) ?? []
    expect(writeOffs).toHaveLength(1)
    expect(writeOffs[0]).toMatchObject({ fromUserId: IDS.meera, toUserId: IDS.aarav, amountPaise: owed, status: "approved" })
    expect(after?.settlements.some((item) => item.status === "pending")).toBe(false)

    // Meera added the gas expense and is gone, so a group admin may now change it.
    const orphan = after?.expenses.find((expense) => expense.id === orphanId)
    expect(orphan?.creatorLeft).toBe(true)
    expect(orphan?.leftMember).toBeNull()
    await db.saveExpense(aarav.id, {
      groupId: IDS.flat,
      id: orphanId,
      description: "Gas refill (fixed)",
      amountPaise: 5000,
      payerId: aarav.id,
      expenseDate: todayISO(),
      category: "utilities",
      shares: [{ userId: IDS.aarav, sharePaise: 5000 }],
    })
    await db.deleteExpense(aarav.id, orphanId)
  })

  it("closes disputes nobody can answer, caps invite codes, and deletes a group", async () => {
    const db = await import("@/lib/demo/db")
    const { todayISO } = await import("@/lib/money")
    const aarav = await db.authenticate("aarav@hissa.app", "demo1234")
    const meera = await db.authenticate("meera@hissa.app", "demo1234")
    const created = await db.createAccount(aarav.id, { email: "kabir@hissa.app", displayName: "Kabir Das" })
    const kabir = await db.authenticate(created.email, created.temporaryPassword)
    await db.joinByCode(kabir.id, "flat4b7k")

    // Meera added and paid for this one, Kabir has the share, and Kabir disputes it.
    const orphanId = await db.saveExpense(meera.id, {
      groupId: IDS.flat,
      description: "Cleaner",
      amountPaise: 6000,
      payerId: meera.id,
      expenseDate: todayISO(),
      category: "utilities",
      shares: [{ userId: kabir.id, sharePaise: 6000 }],
    })
    const flagId = await db.flagExpense(kabir.id, orphanId, "Not mine")
    // Meera disputes something Aarav added, which should close when she leaves.
    const aaravExpense = await db.saveExpense(aarav.id, {
      groupId: IDS.flat,
      description: "Water can",
      amountPaise: 4000,
      payerId: aarav.id,
      expenseDate: todayISO(),
      category: "utilities",
      shares: splitEqually(4000, [IDS.aarav, IDS.meera]),
    })
    const meeraFlag = await db.flagExpense(meera.id, aaravExpense, "Wrong amount")

    // While Meera is around, a plain admin cannot close Kabir's dispute.
    await expect(db.resolveFlag(aarav.id, flagId)).rejects.toThrow(/flagged it/)

    await db.removeMember(aarav.id, IDS.flat, meera.id, true)
    const after = await db.getGroup(aarav.id, IDS.flat)
    expect(after?.expenses.find((e) => e.id === aaravExpense)?.disputed).toBe(false)
    const stuck = after?.expenses.find((e) => e.id === orphanId)
    expect(stuck?.ownerGone).toBe(true)
    expect(stuck?.disputed).toBe(true)
    await db.resolveFlag(aarav.id, flagId)
    const closed = await db.getGroup(aarav.id, IDS.flat)
    expect(closed?.expenses.find((e) => e.id === orphanId)?.disputed).toBe(false)
    expect(meeraFlag).toBeTruthy()

    // An invite code stops after its cap.
    const invite = await db.createInvite(aarav.id, IDS.flat)
    const { GROUP_INVITE_USE_LIMIT } = await import("@/lib/admin")
    for (let i = 0; i < GROUP_INVITE_USE_LIMIT; i++) {
      const email = await db.createInvitedUser({ name: `Guest ${i}`, email: `guest${i}@hissa.app`, password: "secret123" })
      const guest = await db.authenticate(email, "secret123")
      await db.joinByCode(guest.id, invite.code)
    }
    const extra = await db.createInvitedUser({ name: "Late Guest", email: "late@hissa.app", password: "secret123" })
    const late = await db.authenticate(extra, "secret123")
    await expect(db.joinByCode(late.id, invite.code)).rejects.toThrow(/limit/)

    // Only an admin can delete the group, and it disappears for everyone.
    await expect(db.deleteGroup(kabir.id, IDS.flat)).rejects.toThrow(/admin/)
    await db.deleteGroup(aarav.id, IDS.flat)
    expect(await db.getGroup(aarav.id, IDS.flat)).toBeNull()
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
