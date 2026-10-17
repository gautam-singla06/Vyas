import { createServerClient, isServerSupabaseConfigured } from "@/lib/supabase/server";

export type StaffRole = "nurse" | "pharmacist" | "doctor" | "admin";

export interface StaffContext {
  staffId: string;
  userId: string;
  facilityId: string;
  role: StaffRole;
  name: string;
  phone: string;
  email?: string | null;
  district: string;
  facilityName: string;
  facilityType: "PHC" | "CHC";
}

// Check if user is authenticated in Supabase Auth (regardless of staff registration)
export async function getAuthUser() {
  if (!isServerSupabaseConfigured()) return null;
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

// Resolves the signed-in user's staff context (their role + facility scope),
// used by every Server Action for the defense-in-depth facility check that
// mirrors the RLS boundary (ADR-007: RLS enforces at the DB; this enforces
// in app code so a buggy query never reaches the DB). Returns null when the
// user is not authenticated or not registered in the staff table.
export async function getCurrentStaff(): Promise<StaffContext | null> {
  if (!isServerSupabaseConfigured()) return null;
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // staff.user_id -> auth.users.id. RLS allows self-read.
    const { data: staffRow } = await supabase
      .from("staff")
      .select(
        `
        id,
        user_id,
        facility_id,
        role,
        name,
        phone,
        email,
        facilities (
          name,
          type,
          district
        )
      `
      )
      .eq("user_id", user.id)
      .single();

    if (!staffRow) return null;

    const facility = staffRow.facilities as unknown as {
      name: string;
      type: "PHC" | "CHC";
      district: string;
    };

    return {
      staffId: staffRow.id,
      userId: staffRow.user_id,
      facilityId: staffRow.facility_id,
      role: staffRow.role as StaffRole,
      name: staffRow.name,
      phone: staffRow.phone,
      email: (staffRow as any).email ?? null,
      district: facility?.district ?? "",
      facilityName: facility?.name ?? "",
      facilityType: facility?.type ?? "PHC",
    };
  } catch (err) {
    console.error("Error getting current staff context:", err);
    return null;
  }
}

// Convenience: the role-specific landing route after login. Per BUILD.md Phase 2.
export function routeForRole(role: StaffRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "doctor":
      return "/doctor";
    default:
      // nurse and pharmacist both land on the staff data-entry surface.
      return "/staff";
  }
}
