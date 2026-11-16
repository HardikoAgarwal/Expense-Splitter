/** Money is integer paise. ₹1 = 100 paise. Never use binary floats. */

export const MAX_PAISE = 100_000_000_000 // ₹1,00,00,00,000

export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/,/g, "").trim()
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [rupees, fraction = ""] = cleaned.split(".")
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"))
  if (!Number.isSafeInteger(paise)) return null
  if (paise > MAX_PAISE) return null
  return paise
}

export function paiseToInput(paise: number): string {
  const sign = paise < 0 ? "-" : ""
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const fraction = abs % 100
  if (fraction === 0) return `${sign}${rupees}`
  return `${sign}${rupees}.${String(fraction).padStart(2, "0")}`
}

export function formatINR(paise: number, options?: { signed?: boolean }): string {
  const signed = options?.signed ?? false
  const abs = Math.abs(Math.trunc(paise))
  const rupees = Math.floor(abs / 100)
  const fraction = abs % 100
  const body = new Intl.NumberFormat("en-IN").format(rupees)
  const frac = fraction === 0 ? "" : `.${String(fraction).padStart(2, "0")}`
  const sign = signed ? (paise > 0 ? "+" : paise < 0 ? "−" : "") : paise < 0 ? "−" : ""
  return `${sign}₹${body}${frac}`
}

export function todayISO(now = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`
}

export function monthStartISO(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`
}

export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}

export function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export function formatMonthShort(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("")
  return letters || "?"
}

const AVATAR_COLORS = [
  "bg-[#1F6B4A] text-white",
  "bg-[#8C4A2F] text-white",
  "bg-[#2F4F6B] text-white",
  "bg-[#6B3F5A] text-white",
  "bg-[#3F5C45] text-white",
  "bg-[#6B5428] text-white",
]

export function avatarClass(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
