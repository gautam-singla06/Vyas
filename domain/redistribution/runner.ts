"use server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  matchRedistribution,
  type FacilityPoint,
  type StockLevel,
} from "./matching";

// ---------- configurable thresholds (ADR-012 — system owns these) ---------
// Defaults chosen for a district-scale PHC/CHC build. Tunable per-deployment
// without code change is a roadmap item. NOT exported (a "use server" file
// may only export async functions — this keeps the values colocated but local).
const REDISTRIBUTION_RADIUS_KM = 50;
const REDISTRIBUTION_TOP_N = 3;
const SURPLUS_THRESHOLD = 100;   // facility has surplus if qty > this
const DEFICIT_THRESHOLD = 50;    // bring deficit facility up to this

// Triggered after a stock flag is created (Phase 6). Looks up the deficit
// facility + its low-stock item, finds surplus facilities for the same item,
// ranks them by Haversine distance within a radius, and inserts top-N rows
// into redistribution_suggestions with status='pending'.
//
// SUGGESTION ONLY — the matcher never effects a transfer (ADR-012). The admin
// dashboard (Phase 10) lets an admin mark a suggestion 'actioned' or 'dismissed'.
//
// Returns the count of suggestions inserted. Uses the SERVICE-ROLE client
// (redistribution_suggestions writes are service-role only per RLS).
export async function suggestRedistribution(
  deficitFacilityId: string,
  itemName: string,
  deficitQty: number
): Promise<number> {
  const supabase = createServiceClient();

  // 1. Load the deficit facility (need its coords AND its district — the donor
  //    query below scopes candidates to the same district).
  const { data: deficitRow } = await supabase
    .from("facilities")
    .select("id, name, lat, lng, district")
    .eq("id", deficitFacilityId)
    .single();
  if (!deficitRow) return 0;

  // 2. Load candidate donor facilities in the same district (a district admin
  //    will action the suggestion, so we scope donors to the same district).
  const { data: facilitiesRows } = await supabase
    .from("facilities")
    .select("id, name, lat, lng, district")
    .eq("district", (deficitRow as { district?: string }).district ?? "");
  const facilities: FacilityPoint[] = (facilitiesRows ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
    lat: f.lat as number,
    lng: f.lng as number,
  }));
  const deficit = facilities.find((f) => f.id === deficitFacilityId);
  if (!deficit) return 0;

  // 3. Load all stock levels for the item across those facilities.
  const { data: stockRows } = await supabase
    .from("stock_items")
    .select("facility_id, item_name, quantity, unit")
    .ilike("item_name", itemName);
  const stockLevels: StockLevel[] = (stockRows ?? []).map((s) => ({
    facilityId: s.facility_id as string,
    item_name: s.item_name as string,
    quantity: s.quantity as number,
    unit: s.unit as string,
  }));

  // 4. Pure-arithmetic match.
  const candidates = matchRedistribution({
    deficit,
    itemName,
    deficitQty,
    deficitThreshold: DEFICIT_THRESHOLD,
    surplusThreshold: SURPLUS_THRESHOLD,
    facilities,
    stockLevels,
    radiusKm: REDISTRIBUTION_RADIUS_KM,
    topN: REDISTRIBUTION_TOP_N,
  });

  if (candidates.length === 0) return 0;

  // 5. Insert. Idempotency: skip if an existing pending suggestion already
  //    covers this (from, to, item) tuple.
  const incoming = candidates.map((c) => ({
    item_name: c.itemName,
    from_facility_id: c.fromFacilityId,
    to_facility_id: c.toFacilityId,
    suggested_qty: c.suggestedQty,
    distance_km: c.distanceKm,
    status: "pending" as const,
  }));

  const { data: existing } = await supabase
    .from("redistribution_suggestions")
    .select("from_facility_id, to_facility_id, item_name")
    .eq("to_facility_id", deficitFacilityId)
    .eq("status", "pending");

  const existingKeys = new Set(
    (existing ?? []).map(
      (r) =>
        `${r.from_facility_id}|${r.to_facility_id}|${(r.item_name as string).toLowerCase()}`
    )
  );

  const toInsert = incoming.filter(
    (c) =>
      !existingKeys.has(
        `${c.from_facility_id}|${c.to_facility_id}|${c.item_name.toLowerCase()}`
      )
  );

  if (toInsert.length === 0) return 0;

  const { error } = await supabase
    .from("redistribution_suggestions")
    .insert(toInsert);

  if (error) {
    console.error("redistribution insert failed", error);
    return 0;
  }
  return toInsert.length;
}
