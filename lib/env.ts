export function isDemoMode(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ""
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? ""
  if (!url || !key) return true
  if (url.includes("your-project") || key.includes("your-anon")) return true
  return false
}

export const DEMO_ACCOUNTS = [
  { name: "Aarav Mehta", email: "aarav@hissa.app", password: "demo1234" },
  { name: "Meera Shah", email: "meera@hissa.app", password: "demo1234" },
] as const
