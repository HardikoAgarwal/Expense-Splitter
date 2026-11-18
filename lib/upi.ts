/** UPI helpers. Pure, so they run on both server and client and are easy to test. */

const UPI_PATTERN = /^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$/

/** Trims and lowercases a UPI ID. Empty input becomes null (no UPI ID). */
export function normalizeUpi(input: string | null | undefined): string | null {
  const value = (input ?? "").trim().toLowerCase()
  return value ? value : null
}

export function isValidUpi(value: string | null | undefined): boolean {
  return typeof value === "string" && UPI_PATTERN.test(value.trim())
}

/** Returns an error message, or null when the value is fine (empty is fine: it clears the ID). */
export function upiError(input: string): string | null {
  const value = normalizeUpi(input)
  if (!value) return null
  if (!value.includes("@")) return "A UPI ID looks like name@bank"
  if (!isValidUpi(value)) return "That doesn't look like a valid UPI ID (name@bank)"
  return null
}

/** Paise to a UPI amount: always two decimals, no grouping. */
export function upiAmount(paise: number): string {
  return (Math.round(paise) / 100).toFixed(2)
}

/** A upi://pay deep link that UPI apps (GPay, PhonePe, Paytm, BHIM…) understand. */
export function upiPayLink({ vpa, name, amountPaise, note = "Hissa settle-up" }: { vpa: string; name: string; amountPaise: number; note?: string }) {
  const params = [
    ["pa", vpa.trim()],
    ["pn", name.trim()],
    ["am", upiAmount(amountPaise)],
    ["cu", "INR"],
    ["tn", note],
  ]
  return `upi://pay?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`
}
