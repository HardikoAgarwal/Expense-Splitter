import { describe, expect, it } from "vitest"

import { isValidUpi, normalizeUpi, upiAmount, upiError, upiPayLink } from "@/lib/upi"

describe("UPI IDs", () => {
  it("accepts name@bank style handles", () => {
    expect(isValidUpi("hardik@okicici")).toBe(true)
    expect(isValidUpi("hardik.agg-1_2@ybl")).toBe(true)
    expect(isValidUpi("9876543210@paytm")).toBe(true)
  })

  it("rejects malformed handles", () => {
    expect(isValidUpi("hardik")).toBe(false)
    expect(isValidUpi("hardik@")).toBe(false)
    expect(isValidUpi("@ybl")).toBe(false)
    expect(isValidUpi("har dik@ybl")).toBe(false)
    expect(isValidUpi("hardik@1bank")).toBe(false)
    expect(isValidUpi("a@b@c")).toBe(false)
  })

  it("normalises and treats empty as no UPI ID", () => {
    expect(normalizeUpi("  Hardik@OKICICI ")).toBe("hardik@okicici")
    expect(normalizeUpi("   ")).toBeNull()
    expect(upiError("")).toBeNull()
    expect(upiError("hardik")).toMatch(/name@bank/)
  })
})

describe("upiPayLink", () => {
  it("builds an encoded upi://pay link with a two-decimal amount", () => {
    expect(upiPayLink({ vpa: "meera@ybl", name: "Meera Shah", amountPaise: 123450 })).toBe(
      "upi://pay?pa=meera%40ybl&pn=Meera%20Shah&am=1234.50&cu=INR&tn=Hissa%20settle-up",
    )
  })

  it("formats amounts", () => {
    expect(upiAmount(5)).toBe("0.05")
    expect(upiAmount(100000)).toBe("1000.00")
  })
})
