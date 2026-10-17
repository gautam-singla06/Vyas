import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { routeForRole } from "@/lib/auth/context";

/**
 * OAuth callback handler — Supabase redirects here after Google sign-in.
 * Exchanges the `code` for a session, then resolves the staff role
 * exactly the same way as /api/login-resolve (by user_id in the staff table).
 *
 * If the authenticated user is not in the staff table they land on the
 * login page with a `reason=not_registered` param so the UI shows the
 * "contact your district admin" message — same UX as the OTP flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    // No code — Supabase may have sent an error; redirect to login
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

  const supabase = await createServerClient();

  // Exchange the code for a session (sets the auth cookie)
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  // Resolve the user's staff role
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_session`);
  }

  const { data: staff } = await supabase
    .from("staff")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!staff) {
    // Authenticated via Google but not in the staff table yet.
    // Redirect to login with a not_registered signal so the UI explains.
    return NextResponse.redirect(`${origin}/login?reason=not_registered`);
  }

  // Redirect to the role-appropriate page
  const redirectTo =
    next !== "/"
      ? next
      : routeForRole(staff.role as "nurse" | "pharmacist" | "doctor" | "admin");

  return NextResponse.redirect(`${origin}${redirectTo}`);
}
