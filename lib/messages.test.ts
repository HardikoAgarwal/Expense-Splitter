import { describe, expect, it } from "vitest"
import { accountInviteMessage, groupInviteMessage, parseJoinCode } from "@/lib/messages"

describe("share messages", () => {
  it("builds a short account invite with the link and sign-in details on their own lines", () => {
    const text = accountInviteMessage({
      name: "Kabir Das",
      email: "kabir@hissa.app",
      temporaryPassword: "temp-pass",
      welcomeUrl: "https://hissa.example/welcome/abc",
    })
    const lines = text.split("\n")
    expect(lines[0]).toContain("Hi Kabir")
    expect(lines).toContain("https://hissa.example/welcome/abc")
    expect(lines).toContain("Email: kabir@hissa.app")
    expect(lines).toContain("Temporary password: temp-pass")
    expect(lines.length).toBeLessThanOrEqual(8)
  })

  it("builds a group invite with the link on its own line and the code", () => {
    const text = groupInviteMessage({
      group: "Flat 4B",
      appUrl: "https://hissa.example/",
      code: "FLAT4B7K",
    })
    expect(text).toContain("Flat 4B")
    expect(text.split("\n")).toContain("https://hissa.example/join/FLAT4B7K")
    expect(text).toContain("*FLAT4B7K*")
  })

  it("reads a join code from a link or a bare code", () => {
    expect(parseJoinCode("flat4b7k")).toBe("FLAT4B7K")
    expect(parseJoinCode("https://hissa.example/join/Trip9k2m")).toBe("TRIP9K2M")
  })
})
