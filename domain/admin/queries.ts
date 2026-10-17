import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStaff, type StaffContext } from "@/lib/auth/context";
import type { FlagSeverityLike, FlagCategory } from "@/lib/types";

// Each query can accept an already-resolved staff context so a page that loads
// several of them (e.g. the admin dashboard) resolves auth ONCE and passes it
// down, instead of every query re-running getCurrentStaff (4× auth.getUser +
// 4× staff read for a single page). Falls back to resolving it when omitted.
async function resolveStaff(
  staff?: StaffContext | null
): Promise<StaffContext | null> {
  return staff !== undefined ? staff : await getCurrentStaff();
}

export interface FlagRow {
  id: string;
  facility_id: string;
  facility_name: string;
  category: FlagCategory;
  severity: FlagSeverityLike;
  reason_text_en: string | null;
  reason_text_hi: string | null;
  created_at: string;
  resolved: boolean;
}

export interface FacilityMarker {
  id: string;
  name: string;
  type: "PHC" | "CHC";
  lat: number;
  lng: number;
  hasUnresolvedFlag: boolean;
}

export interface SuggestionRow {
  id: string;
  item_name: string;
  from_facility_id: string;
  from_facility_name: string;
  to_facility_id: string;
  to_facility_name: string;
  suggested_qty: number;
  distance_km: number;
  status: "pending" | "actioned" | "dismissed";
  created_at: string;
}

// All admin reads here are RLS-scoped to the admin's own district (RLS policies
// from Phase 1 join facilities.district). Never take a district param from the
// client.

export async function getDistrictFlags(staffCtx?: StaffContext | null): Promise<FlagRow[]> {
  const staff = await resolveStaff(staffCtx);
  if (!staff || staff.role !== "admin") return [];
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("flags")
    .select(
      "id, facility_id, category, severity, reason_text_en, reason_text_hi, created_at, resolved, facilities(name)"
    )
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as Array<{
    id: string;
    facility_id: string;
    category: FlagCategory;
    severity: FlagSeverityLike;
    reason_text_en: string | null;
    reason_text_hi: string | null;
    created_at: string;
    resolved: boolean;
    facilities: { name: string };
  }>).map((r) => ({
    id: r.id,
    facility_id: r.facility_id,
    facility_name: r.facilities?.name ?? "—",
    category: r.category,
    severity: r.severity,
    reason_text_en: r.reason_text_en,
    reason_text_hi: r.reason_text_hi,
    created_at: r.created_at,
    resolved: r.resolved,
  }));
}

export async function getDistrictFacilities(staffCtx?: StaffContext | null): Promise<FacilityMarker[]> {
  const staff = await resolveStaff(staffCtx);
  if (!staff || staff.role !== "admin") return [];
  const supabase = await createServerClient();

  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, type, lat, lng")
    .eq("district", staff.district);

  // Unresolved flags per facility — a single bit per marker.
  const { data: flagFacilities } = await supabase
    .from("flags")
    .select("facility_id")
    .eq("resolved", false);

  const flaggedFacilityIds = new Set((flagFacilities ?? []).map((f) => f.facility_id as string));

  return (facilities ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    type: f.type as "PHC" | "CHC",
    lat: f.lat as number,
    lng: f.lng as number,
    hasUnresolvedFlag: flaggedFacilityIds.has(f.id as string),
  }));
}

export async function getDistrictSuggestions(staffCtx?: StaffContext | null): Promise<SuggestionRow[]> {
  const staff = await resolveStaff(staffCtx);
  if (!staff || staff.role !== "admin") return [];
  const supabase = await createServerClient();

  // Join both sides' facility names. We fetch + resolve names in a second
  // pass against the facilities table for clarity.
  const { data } = await supabase
    .from("redistribution_suggestions")
    .select("id, item_name, from_facility_id, to_facility_id, suggested_qty, distance_km, status, created_at")
    .order("created_at", { ascending: false });

  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name")
    .eq("district", staff.district);
  const nameById = new Map((facilities ?? []).map((f) => [f.id as string, f.name as string]));

  return (data ?? []).map((r) => ({
    id: r.id as string,
    item_name: r.item_name as string,
    from_facility_id: r.from_facility_id as string,
    from_facility_name: nameById.get(r.from_facility_id as string) ?? "—",
    to_facility_id: r.to_facility_id as string,
    to_facility_name: nameById.get(r.to_facility_id as string) ?? "—",
    suggested_qty: r.suggested_qty as number,
    distance_km: Number(r.distance_km),
    status: r.status as "pending" | "actioned" | "dismissed",
    created_at: r.created_at as string,
  }));
}
