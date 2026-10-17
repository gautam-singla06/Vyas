"use server";

import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth/context";
import type { ActionResult } from "@/domain/types";

// Admin-only mutations on flags / redistribution_suggestions.
// RLS already restricts flags writes to the service role, so the admin UI
// resolves a flag via a dedicated path. For redistribution_suggestions, RLS
// grants admin UPDATE permission (actioned / dismissed) but NOT
// insert/delete — exactly the surface this Server Action exposes.

function fail(error: string): ActionResult {
  return { ok: false, error };
}

export async function updateSuggestionStatus(
  suggestionId: string,
  status: "actioned" | "dismissed"
): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (staff.role !== "admin") return fail("Admins only");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("redistribution_suggestions")
    .update({ status })
    .eq("id", suggestionId);

  if (error) return fail(error.message);
  return { ok: true, state: { suggestionId, status } };
}

// Resolve a flag — admin marks it addressed. Re-rippling on the next write re-
// raises it if still breached (handled by the insert-or-upgrade logic in the
// flagging runner: an unresolved existing flag is resolved-then-re-inserted).
export async function resolveFlag(flagId: string): Promise<ActionResult> {
  const staff = await getCurrentStaff();
  if (!staff) return fail("Not authenticated");
  if (staff.role !== "admin") return fail("Admins only");

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("flags")
    .update({ resolved: true })
    .eq("id", flagId);
  if (error) return fail(error.message);
  return { ok: true, state: { flagId } };
}
