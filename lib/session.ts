import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

const COOKIE = "hissa_session"

function secret() {
  return process.env.DEMO_SESSION_SECRET || "hissa-demo-session-dev-only"
}

export function sealUserId(userId: string) {
  const sig = createHmac("sha256", secret()).update(userId).digest("hex")
  return `${userId}.${sig}`
}

export function openUserId(token: string | undefined) {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac("sha256", secret()).update(userId).digest("hex")
  const actual = Buffer.from(sig)
  const wanted = Buffer.from(expected)
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null
  return userId
}

export async function readDemoUserId() {
  const jar = await cookies()
  return openUserId(jar.get(COOKIE)?.value)
}

export async function writeDemoUserId(userId: string) {
  const jar = await cookies()
  jar.set(COOKIE, sealUserId(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearDemoUserId() {
  const jar = await cookies()
  jar.delete(COOKIE)
}
