import { createServiceClient } from "@/lib/supabase/server";
import {
  forecastStock,
  severityForStock,
  severityForBed,
  severityForDoctor,
  severityForTest,
  type Severity,
} from "./forecast";

// Flagging & Analytics — server-side runner (ADR-005 deterministic stage).
// Writes flags rows with severity + category set and reason_text* NULL. The
// generative layer (Phase 8) will fill reason_text afterward; if it fails,
// the flag is still visible on the dashboard with its raw numbers.
//
// Uses the SERVICE-ROLE client because RLS restricts `flags` writes to the
// service role (the AI module is trusted server-side). These run functions
// are NOT directly callable by the browser — they're invoked server-side
// from the stock/bed/test Server Actions after a write, or from a cron sweep.

type FlagCategory = "stock" | "bed" | "doctor" | "test";

interface ExistingFlag {
  id: string;
  severity: Severity;
}

// Idempotency: if an unresolved flag of the same category + facility + (item
// for stock) already exists at the same-or-higher severity, we don't
// duplicate it. If a lower severity exists, we resolve it and insert the new
// higher one, so the dashboard shows the current worst state.

async function findExistingFlag(
  facilityId: string,
  category: FlagCategory,
  itemKey?: string
): Promise<ExistingFlag | null> {
  const supabase = createServiceClient();
  let q = supabase
    .from("flags")
    .select("id, severity")
    .eq("facility_id", facilityId)
    .eq("category", category)
    .eq("resolved", false);
  if (itemKey) {
    // The flags schema has no item-key column; for v1 we use one stock flag
    // per facility that aggregates items, and the generative layer (Phase 8)
    // will list the specific item(s) in reason_text. No refinement needed here.
  }
  const { data } = await q.order("created_at", { ascending: false }).limit(1);
  return data && data[0] ? { id: data[0].id, severity: data[0].severity as Severity } : null;
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  warning: 2,
  watch: 1,
};

async function insertOrUpgradeFlag(
  facilityId: string,
  category: FlagCategory,
  severity: Severity,
  extra: { stockItemId?: string; daysToZero?: number | null; facilityName?: string; itemName?: string; currentQty?: number } = {}
): Promise<{ inserted: boolean; flagId?: string }> {
  const supabase = createServiceClient();
  const existing = await findExistingFlag(facilityId, category);

  if (existing) {
    if (SEVERITY_RANK[existing.severity] >= SEVERITY_RANK[severity]) {
      return { inserted: false, flagId: existing.id }; // nothing to escalate
    }
    // Resolve the lower-severity flag and insert the new one so the dashboard
    // reflects the current worst tier.
    await supabase.from("flags").update({ resolved: true }).eq("id", existing.id);
  }

  const { data, error } = await supabase
    .from("flags")
    .insert({
      facility_id: facilityId,
      category,
      severity,
      reason_text_en: null,
      reason_text_hi: null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("flag insert failed", error);
    return { inserted: false };
  }
  // Best-effort explanation-generation (Phase 8, ADR-005 failure isolation):
  // runs after the flag row commits. If it throws or the LLM is down, the
  // flag is already visible with its raw severity — only the friendly
  // sentence is missing, which the dashboard handles by showing raw numbers.
  if (extra.facilityName) {
    try {
      const { explainAndStoreFlag } = await import("@/lib/ai/gemini");
      await explainAndStoreFlag({
        flagId: data.id,
        category,
        severity,
        facilityName: extra.facilityName,
        ...(category === "stock"
          ? { itemName: extra.itemName, daysToZero: extra.daysToZero, currentQty: extra.currentQty }
          : {}),
      });
    } catch (err) {
      console.error("flag explanation generation failed", err);
    }
  }
  return { inserted: true, flagId: data.id };
}

// ---------------------------------------------------------------------------
// Per-write triggers (invoked from the resource-monitoring/workforce Server
// Actions after a successful sync, and from a cron-style sweep).
// ---------------------------------------------------------------------------

// Resolves a facility name so the generative explanation (Phase 8) has plain-
// language context. Service-role read; safe because `flags` writes themselves
// are service-role-gated, and this read is read-open on facilities.
async function resolveFacilityName(facilityId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("facilities")
    .select("name")
    .eq("id", facilityId)
    .single();
  return data ? (data.name as string) : null;
}

export async function evaluateStockFlag(
  facilityId: string,
  stockItemId: string,
  currentQty: number
): Promise<void> {
  const supabase = createServiceClient();
  // Read the last 14 days of stock_logs for this item.
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await supabase
    .from("stock_logs")
    .select("delta, created_at")
    .eq("stock_item_id", stockItemId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const deltas = (logs ?? []).map((l) => ({
    t: l.created_at as string,
    delta: l.delta as number,
  }));

  const fc = forecastStock({ currentQuantity: currentQty, deltas, windowDays: 14 });
  const severity = severityForStock(fc.daysToZero);
  if (!severity) return;

  // Resolve context once — name + item name — so both the explanation
  // generator and the redistribution matcher share one read.
  const facilityName = await resolveFacilityName(facilityId);
  const { data: itemRow } = await supabase
    .from("stock_items")
    .select("item_name")
    .eq("id", stockItemId)
    .single();
  const itemName = itemRow ? (itemRow.item_name as string) : undefined;

  const { inserted } = await insertOrUpgradeFlag(facilityId, "stock", severity, {
    stockItemId,
    daysToZero: fc.daysToZero,
    currentQty,
    facilityName: facilityName ?? undefined,
    itemName,
  });

  // Trigger redistribution matching only when a NEW flag was just raised for a
  // stock item — re-evaluating on every write that doesn't change the flag is
  // wasted work, and would re-insert suggestions we skipped above as duplicates.
  if (inserted && itemName) {
    try {
      const { suggestRedistribution } = await import("@/domain/redistribution/runner");
      await suggestRedistribution(facilityId, itemName, currentQty);
    } catch (err) {
      console.error("redistribution suggestion failed", err);
    }
  }
}

export async function evaluateBedFlag(
  facilityId: string,
  occupied: number,
  total: number
): Promise<void> {
  const severity = severityForBed(occupied, total);
  if (!severity) return;
  const facilityName = await resolveFacilityName(facilityId);
  await insertOrUpgradeFlag(facilityId, "bed", severity, {
    facilityName: facilityName ?? undefined,
  });
}

export async function evaluateTestFlag(
  facilityId: string,
  isFunctional: boolean
): Promise<void> {
  const severity = severityForTest(isFunctional);
  if (!severity) return;
  const facilityName = await resolveFacilityName(facilityId);
  await insertOrUpgradeFlag(facilityId, "test", severity, {
    facilityName: facilityName ?? undefined,
  });
}

// Doctor absence check — invoked by a daily sweep (Phase 13 cron or a manual
// admin action). `checkedInByCutoff` is computed by the caller.
export async function evaluateDoctorFlag(
  facilityId: string,
  checkedInByCutoff: boolean
): Promise<void> {
  const severity = severityForDoctor(checkedInByCutoff);
  if (!severity) return;
  const facilityName = await resolveFacilityName(facilityId);
  await insertOrUpgradeFlag(facilityId, "doctor", severity, {
    facilityName: facilityName ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// District-wide doctor absence sweep. For each facility, checks whether a
// doctor checked in by today's cutoff (default 11:00 local). Marks a critical
// flag for facilities with no check-in. Returns the count of flags raised.
// ---------------------------------------------------------------------------
export async function sweepDoctorAbsence(cutoffHour = 11): Promise<number> {
  const supabase = createServiceClient();
  const { data: facilities } = await supabase.from("facilities").select("id");
  if (!facilities || facilities.length === 0) return 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const cutoffToday = new Date();
  cutoffToday.setHours(cutoffHour, 0, 0, 0);

  // Single query for all of today's pre-cutoff check-ins across the district,
  // then compare in memory — avoids the previous N+1 (one query per facility).
  const { data: attendance } = await supabase
    .from("doctor_attendance")
    .select("facility_id")
    .gte("check_in", startOfToday.toISOString())
    .lte("check_in", cutoffToday.toISOString());

  const checkedInFacilityIds = new Set(
    (attendance ?? []).map((a) => a.facility_id as string)
  );

  let raised = 0;
  for (const f of facilities) {
    if (!checkedInFacilityIds.has(f.id as string)) {
      await evaluateDoctorFlag(f.id, false);
      raised += 1;
    }
  }
  return raised;
}
