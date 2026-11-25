import { describe, expect, it } from "vitest"
import {
  groupAdminBlockReason,
  promoteMemberBlockReason,
  memberExitBlockReason,
  removeMemberBlockReason,
} from "@/lib/group-access"

describe("group admin permissions", () => {
  it("lets only an admin manage the group", () => {
    expect(groupAdminBlockReason("admin")).toBeNull()
    expect(groupAdminBlockReason("owner")).toBeNull()
    expect(groupAdminBlockReason("member")).toMatch(/group admin/)
  })

  it("lets an admin remove a member, and protects the last admin", () => {
    expect(
      removeMemberBlockReason({ actorRole: "admin", targetRole: "member", adminCount: 1 }),
    ).toBeNull()
    expect(
      removeMemberBlockReason({ actorRole: "member", targetRole: "member", adminCount: 1 }),
    ).toMatch(/group admin/)
    expect(
      removeMemberBlockReason({ actorRole: "admin", targetRole: "admin", adminCount: 1 }),
    ).toMatch(/at least one admin/)
    expect(
      removeMemberBlockReason({ actorRole: "admin", targetRole: "admin", adminCount: 2 }),
    ).toBeNull()
  })

  it("lets an admin promote a member, not someone who is already an admin", () => {
    expect(promoteMemberBlockReason({ actorRole: "admin", targetRole: "member" })).toBeNull()
    expect(promoteMemberBlockReason({ actorRole: "admin", targetRole: "admin" })).toMatch(/already/)
    expect(promoteMemberBlockReason({ actorRole: "member", targetRole: "member" })).toMatch(/group admin/)
  })
})

describe("memberExitBlockReason", () => {
  const base = { self: true, role: "member", adminCount: 1, memberCount: 3, netPaise: 0, pendingCount: 0 }

  it("lets a settled-up member leave", () => {
    expect(memberExitBlockReason(base)).toBeNull()
  })

  it("blocks leaving while money is owed either way", () => {
    expect(memberExitBlockReason({ ...base, netPaise: -85000 })).toMatch(/still owe ₹850/)
    expect(memberExitBlockReason({ ...base, netPaise: 12000 })).toMatch(/still owed/)
    expect(memberExitBlockReason({ ...base, self: false, netPaise: -85000 })).toMatch(/They still owe/)
  })

  it("blocks leaving with a payment waiting for approval", () => {
    expect(memberExitBlockReason({ ...base, pendingCount: 1 })).toMatch(/waiting for approval/)
  })

  it("keeps at least one admin and does not strand the last person", () => {
    expect(memberExitBlockReason({ ...base, role: "admin" })).toMatch(/someone else an admin/)
    expect(memberExitBlockReason({ ...base, role: "admin", adminCount: 2 })).toBeNull()
    expect(memberExitBlockReason({ ...base, memberCount: 1 })).toMatch(/Delete the group/)
  })
})
