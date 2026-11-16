import { describe, expect, it } from "vitest"
import {
  groupAdminBlockReason,
  promoteMemberBlockReason,
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
