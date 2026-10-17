import { type NextRequest, NextResponse } from "next/server";
import { createMiddlewareClient, isServerSupabaseConfigured } from "@/lib/supabase";

// Per BUILD.md Phase 2: protect /staff, /doctor, /admin. Explicitly exclude
// /(public) routes (ADR-008) and /login — patient lookup must never see an
// auth prompt, even accidentally via shared layout/proxy logic.
//
// In Next.js 16.2.10, Next.js supports `proxy.ts` with named export `proxy`
// or `default`. We export both `proxy` and `middleware` for maximum compatibility.

const PROTECTED = ["/staff", "/doctor", "/admin"];

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );

  // If Supabase is not configured yet, redirect protected routes to /login with notice
  if (!isServerSupabaseConfigured()) {
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", path);
      loginUrl.searchParams.set("error", "unconfigured");
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  try {
    const supabase = createMiddlewareClient(
      () => request.cookies.getAll(),
      (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value);
        });
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isProtected && !user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }
  } catch (err) {
    console.error("Auth middleware check error:", err);
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const middleware = proxy;
export default proxy;

export const config = {
  matcher: ["/staff/:path*", "/doctor/:path*", "/admin/:path*"],
};
