"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth/context";
import { canManageFacilityResources } from "@/lib/auth/authorization";
import type { ActionResult, ActionKey } from "@/domain/types";

// ---------------------------------------------------------------------------
// Resource Monitoring — Server Actions (Phase 3, ADR-001)
//
// Every action:
//   1. Resolves the caller's staff context (getCurrentStaff) and verifies the
//      target facility_id matches the caller's own facility (defense-in-depth
//      on top of RLS per ADR-007).
//   2. Performs the write via the authenticated (RLS-enforced) server client.
//   3. For stock writes, also inserts the append-only stock_logs delta row.
//   4. Returns a deterministic ActionResult so the offline queue (Phase 5)
//      can replay it identically from a queued sync.
//
// No AI forecast trigger yet (that's Phase 6/7).
// ---------------------------------------------------------------------------

// Re-exported action keys live in domain/types.ts (not exported from a
// "use server" file, since those may only export async functions when their
// module is reached through the client-band server-action bundle).
// Import RESOURCE_ACTION_KEYS from "@/domain/types" if you need the list.

// --- helpers ---------------------------------------------------------------

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function ok(state?: Record<string, unknown>): ActionResult {
  return { ok: true, state };
}

// --- Stock ----------------------------------------------------------------

export interface StockAdjustPayload {
  stockItemId: string;
  delta: number;        // negative for consumption, positive for restock
  source?: "app" | "voice" | "sms";
}

// Adjusts a stock item's quantity by `delta` and appends a stock_logs row.
// Same Server Action is used for typed +/- (app), voice (Phase 9), and SMS
// (Phase 12) writes — source distinguishes them on the audit trail.
export async function adjustStock(
  payload: StockAdjustPayload
): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (!canManageFacilityResources(staff.role)) return fail("Insufficient permissions");
  if (!Number.isInteger(payload.delta) || payload.delta === 0) {
    return fail("delta must be a non-zero integer");
  }

  const supabase = await createServerClient();

  // 1. Read the target row to confirm it belongs to the caller's facility
  //    (defense-in-depth; RLS already prevents the read otherwise).
  const { data: item, error: readErr } = await supabase
    .from("stock_items")
    .select("id, facility_id, quantity, item_name")
    .eq("id", payload.stockItemId)
    .single();

  if (readErr || !item) return fail("Stock item not found");
  if (item.facility_id !== staff.facilityId) {
    return fail("Stock item does not belong to your facility");
  }

  const newQty = (item.quantity as number) + payload.delta;
  if (newQty < 0) {
    return fail(
      `Cannot reduce below zero (would be ${newQty}). Current: ${item.quantity}.`
    );
  }

  // 2. Update current state. Last-write-wins at the row level (ADR-003).
  const { error: updErr } = await supabase
    .from("stock_items")
    .update({
      quantity: newQty,
      updated_at: new Date().toISOString(),
      updated_by: staff.staffId,
    })
    .eq("id", payload.stockItemId);

  if (updErr) return fail(updErr.message);

  // 3. Append the audit trail row (ADR-003 — never updated or deleted).
  const { error: logErr } = await supabase.from("stock_logs").insert({
    stock_item_id: payload.stockItemId,
    delta: payload.delta,
    source: payload.source ?? "app",
  });

  if (logErr) {
    // The current-state write succeeded but the audit log failed. We do NOT
    // roll back the quantity update — per ADR-003 the audit trail is best-
    // effort over last-write-wins, and a missing delta row is recoverable.
    // Surface a soft warning in the result state.
    return ok({
      stockItemId: payload.stockItemId,
      quantity: newQty,
      auditLogFailed: true,
    });
  }

  // 4. Trigger the deterministic forecast + severity evaluation (Phase 6,
  //    ADR-005). Runs server-side after the write commits. Failures here
  //    do NOT bubble up to the caller — the data write itself is complete and
  //    the offline queue should not retry the user's write because a flag
  //    computation hiccupped.
  try {
    const { evaluateStockFlag } = await import("@/domain/flagging-analytics/runner");
    await evaluateStockFlag(staff.facilityId, payload.stockItemId, newQty);
  } catch (err) {
    console.error("stock flag evaluation failed", err);
  }

  return ok({ stockItemId: payload.stockItemId, quantity: newQty });
}

// Convenience helper used by the voice intent parser (Phase 9) and SMS
// webhook (Phase 12) when they need to "set" a quantity (e.g., "Paracetamol
// khatam" => quantity 0). Internally computes a delta and reuses adjustStock
// so the audit trail stays append-only and consistent.
export async function restockTo(
  payload: { stockItemId: string; quantity: number; source?: "app" | "voice" | "sms" }
): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (!canManageFacilityResources(staff.role)) return fail("Insufficient permissions");
  if (!Number.isInteger(payload.quantity) || payload.quantity < 0) {
    return fail("quantity must be a non-negative integer");
  }

  const supabase = await createServerClient();
  const { data: item, error } = await supabase
    .from("stock_items")
    .select("quantity")
    .eq("id", payload.stockItemId)
    .single();
  if (error || !item) return fail("Stock item not found");

  const delta = payload.quantity - (item.quantity as number);
  if (delta === 0) return ok({ stockItemId: payload.stockItemId, quantity: payload.quantity });
  return adjustStock({
    stockItemId: payload.stockItemId,
    delta,
    source: payload.source ?? "app",
  });
}

// --- Bed ------------------------------------------------------------------

export interface BedSetPayload {
  facilityId: string;
  occupied?: number;   // set absolute occupied count
  total?: number;      // (optional) update total too
}

export async function setBed(payload: BedSetPayload): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (!canManageFacilityResources(staff.role)) return fail("Insufficient permissions");
  if (payload.facilityId !== staff.facilityId) {
    return fail("Bed status does not belong to your facility");
  }
  if (payload.occupied !== undefined && payload.occupied < 0) {
    return fail("occupied must be >= 0");
  }
  if (payload.total !== undefined && payload.total < 0) {
    return fail("total must be >= 0");
  }
  if (
    payload.occupied !== undefined &&
    payload.total !== undefined &&
    payload.occupied > payload.total
  ) {
    return fail("occupied cannot exceed total");
  }

  const supabase = await createServerClient();

  // Upsert: bed_status is keyed by facility_id. Read current row to enforce
  // the occupied<=total invariant against an existing total.
  const { data: existing } = await supabase
    .from("bed_status")
    .select("total, occupied")
    .eq("facility_id", payload.facilityId)
    .single();

  const total = payload.total ?? (existing?.total as number) ?? 0;
  const occupied =
    payload.occupied ?? (existing?.occupied as number) ?? 0;
  if (occupied > total) return fail("occupied cannot exceed total");

  const { error } = await supabase.from("bed_status").upsert(
    {
      facility_id: payload.facilityId,
      total,
      occupied,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "facility_id" }
  );

  if (error) return fail(error.message);

  try {
    const { evaluateBedFlag } = await import("@/domain/flagging-analytics/runner");
    await evaluateBedFlag(payload.facilityId, occupied, total);
  } catch (err) {
    console.error("bed flag evaluation failed", err);
  }

  return ok({ facilityId: payload.facilityId, total, occupied });
}

// Toggle a single bed: delta +1 (admit) or -1 (discharge).
export async function toggleBed(
  payload: { facilityId: string; direction: "admit" | "discharge" }
): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (!canManageFacilityResources(staff.role)) return fail("Insufficient permissions");
  if (payload.facilityId !== staff.facilityId) {
    return fail("Bed status does not belong to your facility");
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("bed_status")
    .select("total, occupied")
    .eq("facility_id", payload.facilityId)
    .single();

  let total = (existing?.total as number) ?? 0;
  let occupied = (existing?.occupied as number) ?? 0;

  if (payload.direction === "admit") {
    if (occupied >= total) return fail("All beds already occupied");
    occupied += 1;
  } else {
    if (occupied <= 0) return fail("No occupied beds to discharge");
    occupied -= 1;
  }

  const { error } = await supabase.from("bed_status").upsert(
    {
      facility_id: payload.facilityId,
      total,
      occupied,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "facility_id" }
  );

  if (error) return fail(error.message);

  try {
    const { evaluateBedFlag } = await import("@/domain/flagging-analytics/runner");
    await evaluateBedFlag(payload.facilityId, occupied, total);
  } catch (err) {
    console.error("bed flag evaluation failed", err);
  }

  return ok({ facilityId: payload.facilityId, total, occupied });
}

// --- Test equipment availability -----------------------------------------

export async function setTestAvailability(
  payload: { testId: string; isFunctional: boolean }
): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (!canManageFacilityResources(staff.role)) return fail("Insufficient permissions");

  const supabase = await createServerClient();
  // Verify ownership (defense-in-depth).
  const { data: test } = await supabase
    .from("test_availability")
    .select("id, facility_id")
    .eq("id", payload.testId)
    .single();
  if (!test || test.facility_id !== staff.facilityId) {
    return fail("Test row not found or not in your facility");
  }

  const { error } = await supabase
    .from("test_availability")
    .update({
      is_functional: payload.isFunctional,
      updated_at: new Date().toISOString(),
    })
      .eq("id", payload.testId);
  if (error) return fail(error.message);

  try {
    const { evaluateTestFlag } = await import("@/domain/flagging-analytics/runner");
    await evaluateTestFlag(staff.facilityId, payload.isFunctional);
  } catch (err) {
    console.error("test flag evaluation failed", err);
  }

  return ok({ testId: payload.testId, isFunctional: payload.isFunctional });
}

// --- Footfall -------------------------------------------------------------

export async function incrementFootfall(
  payload: { facilityId: string; date?: string }
): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (!canManageFacilityResources(staff.role)) return fail("Insufficient permissions");
  if (payload.facilityId !== staff.facilityId) {
    return fail("Footfall does not belong to your facility");
  }

  const date = payload.date ?? new Date().toISOString().slice(0, 10);
  const supabase = await createServerClient();

  // Atomic increment in a single statement (INSERT ... ON CONFLICT DO UPDATE
  // SET count = count + 1 RETURNING count) via the increment_footfall RPC. The
  // previous read-then-write lost increments under concurrency: two callers
  // could both read N and both write N+1.
  const { data, error } = await supabase.rpc("increment_footfall", {
    p_facility_id: payload.facilityId,
    p_date: date,
  });
  if (error) return fail(error.message);
  return ok({ facilityId: payload.facilityId, date, count: data as number });
}
