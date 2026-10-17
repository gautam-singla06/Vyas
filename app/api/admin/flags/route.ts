import { NextResponse } from "next/server";
import { getDistrictFlags } from "@/domain/admin/queries";
import { getCurrentStaff } from "@/lib/auth/context";

// POST-only helper the dashboard's realtime subscription calls on a `flags`
// table change to re-sync the full ordered list (the row-level payload from
// Supabase Realtime doesn't carry joined facility names, so a uniform re-fetch
// keeps the dashboard coherent).
export async function POST() {
  // Reject unauthenticated / non-admin callers with a real 401 instead of
  // quietly returning an empty list (which leaks that the endpoint exists and
  // is inconsistent with REST conventions).
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const flags = await getDistrictFlags(staff);
  return NextResponse.json({ flags });
}

export async function GET() {
  return NextResponse.json({ flags: [] }, { status: 405 });
}
