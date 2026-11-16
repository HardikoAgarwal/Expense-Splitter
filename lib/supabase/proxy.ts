import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PREFIXES = ["/login", "/join", "/welcome"]

function isPublic(pathname: string) {
  return pathname === "/" || PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export async function updateSupabaseSession(request: NextRequest) {
  if (request.nextUrl.pathname === "/signup" || request.nextUrl.pathname.startsWith("/signup/")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const { data } = await supabase.auth.getUser()
  const user = data.user
  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/groups", request.url))
  }

  return response
}

export function updateDemoSession(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  const signedIn = Boolean(request.cookies.get("hissa_session")?.value)
  if (!signedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }
  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    const next = request.nextUrl.searchParams.get("next")
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return NextResponse.redirect(new URL(next, request.url))
    }
    return NextResponse.redirect(new URL("/groups", request.url))
  }
  return NextResponse.next()
}
