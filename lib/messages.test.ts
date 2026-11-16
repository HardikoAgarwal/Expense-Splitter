import { describe, expect, it } from "vitest"
import { accountInviteMessage, groupInviteMessage, parseJoinCode } from "@/lib/messages"

describe("share messages", () => {
  it("builds an account invite the admin can paste", () => {
    const text = accountInviteMessage({
      name: "Kabir Das",
      appUrl: "https://hissa.example",
      email: "kabir@hissa.app",
      temporaryPassword: "temp-pass",
      welcomeUrl: "https://hissa.example/welcome/abc",
    })
    expect(text).toContain("Hey Kabir!")
    expect(text).toContain("https://hissa.example")
    expect(text).toContain("kabir@hissa.app")
    expect(text).toContain("temp-pass")
    expect(text).toContain("https://hissa.example/welcome/abc")
  })

  it("builds a group invite with the code and link", () => {
    const text = groupInviteMessage({
      group: "Flat 4B",
      appUrl: "https://hissa.example",
      code: "FLAT4B7K",
    })
    expect(text).toContain("Flat 4B")
    expect(text).toContain("https://hissa.example/join/FLAT4B7K")
    expect(text).toContain("FLAT4B7K")
  })

  it("reads a join code from a link or a bare code", () => {
    expect(parseJoinCode("flat4b7k")).toBe("FLAT4B7K")
    expect(parseJoinCode("https://hissa.example/join/Trip9k2m")).toBe("TRIP9K2M")
  })
})
