import { NextResponse } from "next/server";
import {
  createServerClient,
  createServiceClient,
  isServerSupabaseConfigured,
} from "@/lib/supabase/server";
import { routeForRole, type StaffRole } from "@/lib/auth/context";

// Called by the client after successful Supabase Auth (OTP or email/password).
// Resolves existing staff row by user_id or safely links pre-provisioned staff
// records (matched by phone or email) using the server-side service role client.
export async function POST() {
  if (!isServerSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "unconfigured", message: "Supabase environment variables are missing." },
      { status: 503 }
    );
  }

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, reason: "unknown" }, { status: 401 });
  }

  // 1. Check if the user is already linked by user_id
  const { data: existingStaff } = await supabase
    .from("staff")
    .select("role, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingStaff) {
    return NextResponse.json({
      ok: true,
      redirectTo: routeForRole(existingStaff.role as StaffRole),
      name: existingStaff.name as string,
    });
  }

  // 2. Pre-provisioned staff account linking via service role
  // Look for a staff row that was pre-provisioned by district admin with this phone or email
  try {
    const serviceClient = createServiceClient();
    const userPhone = user.phone ? user.phone.trim() : null;
    const userEmail = user.email ? user.email.trim().toLowerCase() : null;

    let matchedStaff: { id: string; role: string; name: string } | null = null;

    if (userPhone) {
      // Direct match
      const { data } = await serviceClient
        .from("staff")
        .select("id, role, name, user_id")
        .eq("phone", userPhone)
        .maybeSingle();

      if (data && (!data.user_id || data.user_id === user.id)) {
        matchedStaff = data;
      } else if (!data && userPhone.startsWith("+91")) {
        // Also check if stored without +91 country prefix
        const bareDigits = userPhone.replace(/^\+91/, "");
        const { data: altData } = await serviceClient
          .from("staff")
          .select("id, role, name, user_id")
          .eq("phone", bareDigits)
          .maybeSingle();

        if (altData && (!altData.user_id || altData.user_id === user.id)) {
          matchedStaff = altData;
        }
      }
    }

    if (!matchedStaff && userEmail) {
      const { data } = await serviceClient
        .from("staff")
        .select("id, role, name, user_id")
        .ilike("email", userEmail)
        .maybeSingle();

      if (data && (!data.user_id || data.user_id === user.id)) {
        matchedStaff = data;
      }
    }

    if (matchedStaff) {
      // Link the account to this authenticated user
      const { data: linkedStaff, error: linkError } = await serviceClient
        .from("staff")
        .update({ user_id: user.id })
        .eq("id", matchedStaff.id)
        .is("user_id", null)
        .select("id")
        .maybeSingle();

      // Make account claiming atomic: a second authenticated account cannot
      // overwrite a roster entry that was linked between lookup and update.
      if (linkError || !linkedStaff) {
        return NextResponse.json({ ok: false, reason: "not_registered" }, { status: 409 });
      }

      return NextResponse.json({
        ok: true,
        redirectTo: routeForRole(matchedStaff.role as StaffRole),
        name: matchedStaff.name,
      });
    }
  } catch (err) {
    console.error("Account linking error in login-resolve:", err);
  }

  // Auth succeeded but user is not in the pre-provisioned staff roster
  return NextResponse.json({ ok: false, reason: "not_registered" });
}

export async function GET() {
  return NextResponse.json({ ok: false, reason: "unknown" }, { status: 405 });
}
