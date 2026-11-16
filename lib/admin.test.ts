import { describe, expect, it } from "vitest"
import { adminBlockReason, mutateUserBlockReason, signInBlockReason } from "@/lib/admin"

const admin = { id: "admin", isAdmin: true, disabled: false, invited: true }
const member = { id: "member", isAdmin: false, disabled: false, invited: true }
const stranger = { id: "stranger", isAdmin: false, disabled: false, invited: false }
const disabled = { id: "disabled", isAdmin: false, disabled: true, invited: true }

describe("sign-in access", () => {
  it("allows invited people and the admin", () => {
    expect(signInBlockReason(member)).toBeNull()
    expect(signInBlockReason(admin)).toBeNull()
  })

  it("blocks anyone the admin did not invite", () => {
    expect(signInBlockReason(null)).toMatch(/invite only/)
    expect(signInBlockReason(stranger)).toMatch(/invite only/)
  })

  it("blocks a disabled account even if they were invited", () => {
    expect(signInBlockReason(disabled)).toMatch(/disabled/)
  })
})

describe("admin actions", () => {
  it("lets only an active admin manage people", () => {
    expect(adminBlockReason(admin)).toBeNull()
    expect(adminBlockReason(member)).toMatch(/admin/)
    expect(adminBlockReason({ ...admin, disabled: true })).toMatch(/admin/)
    expect(adminBlockReason(null)).toMatch(/admin/)
  })

  it("stops an admin from disabling or removing their own account", () => {
    expect(mutateUserBlockReason(admin, "admin")).toMatch(/own access/)
    expect(mutateUserBlockReason(admin, "member")).toBeNull()
    expect(mutateUserBlockReason(member, "admin")).toMatch(/admin/)
  })
})
