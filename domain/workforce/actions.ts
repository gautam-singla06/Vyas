"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth/context";
import type { ActionResult } from "@/domain/types";

// Workforce domain — doctor_attendance Server Actions (Phase 4, ADR-001).
// Geo-coordinates are a secondary signal; if the browser denies geolocation,
// we still record the attendance event with null coords (per BUILD.md): "the
// primary signal (did the doctor show up) matters more than the secondary
// signal (exactly where)."

function fail(error: string): ActionResult {
  return { ok: false, error };
}
function ok(state?: Record<string, unknown>): ActionResult {
  return { ok: true, state };
}

export async function doctorCheckIn(
  payload: { facilityId: string; geoLat?: number | null; geoLng?: number | null }
): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (staff.role !== "doctor") return fail("Only doctors can check in");
  if (payload.facilityId !== staff.facilityId) {
    return fail("Attendance does not belong to your facility");
  }

  const supabase = await createServerClient();

  // Guard against an already-open session (idempotent check-in).
  const { data: open } = await supabase
    .from("doctor_attendance")
    .select("id")
    .eq("staff_id", staff.staffId)
    .is("check_out", null)
    .maybeSingle();
  if (open) return ok({ attendanceId: open.id, alreadyCheckedIn: true });

  const { data, error } = await supabase
    .from("doctor_attendance")
    .insert({
      staff_id: staff.staffId,
      facility_id: payload.facilityId,
      geo_lat: payload.geoLat ?? null,
      geo_lng: payload.geoLng ?? null,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);
  return ok({ attendanceId: data.id });
}

export async function doctorCheckOut(): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (staff.role !== "doctor") return fail("Only doctors can check out");

  const supabase = await createServerClient();

  const { data: open } = await supabase
    .from("doctor_attendance")
    .select("id")
    .eq("staff_id", staff.staffId)
    .is("check_out", null)
    .maybeSingle();

  if (!open) return fail("No open check-in to close");

  const { error } = await supabase
    .from("doctor_attendance")
    .update({ check_out: new Date().toISOString() })
    .eq("id", open.id);

  if (error) return fail(error.message);
  return ok({ attendanceId: open.id });
}

// Read whether the signed-in doctor currently has an open session.
export async function getMyOpenAttendance(): Promise<{
  open: boolean;
  checkIn?: string;
  attendanceId?: string;
} | null> {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "doctor") return null;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("doctor_attendance")
    .select("id, check_in")
    .eq("staff_id", staff.staffId)
    .is("check_out", null)
    .maybeSingle();

  if (!data) return { open: false };
  return { open: true, checkIn: data.check_in as string, attendanceId: data.id as string };
}
