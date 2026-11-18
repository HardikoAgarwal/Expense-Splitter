import type { NextRequest } from "next/server"

import { isDemoMode } from "@/lib/env"
import { updateDemoSession, updateSupabaseSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  if (isDemoMode()) return updateDemoSession(request)
  return updateSupabaseSession(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|html)$).*)",
  ],
}
