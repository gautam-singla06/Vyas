"use server";

import {
  adjustStock,
  restockTo,
  setBed,
  toggleBed,
  setTestAvailability,
  incrementFootfall,
} from "@/domain/resource-monitoring/actions";
import { doctorCheckIn, doctorCheckOut } from "@/domain/workforce/actions";
import type { ActionKey } from "@/domain/types";
import type { ActionResult } from "@/domain/types";

// Replay router: maps a queued ActionKey to its Server Action and invokes it
// with the stored payload. Used by the offline sync flusher (Phase 5) so a
// queued action replays identically to a live one — the same server code path
// runs regardless of whether the call came through directly or via the queue.
export async function replayAction(
  action: ActionKey,
  payload: Record<string, unknown>
): Promise<ActionResult> {
  switch (action) {
    case "stock.adjust":
      return adjustStock({
        stockItemId: payload.stockItemId as string,
        delta: payload.delta as number,
        source: (payload.source as "app" | "voice" | "sms" | undefined) ?? "app",
      });
    case "stock.restock":
      return restockTo({
        stockItemId: payload.stockItemId as string,
        quantity: payload.quantity as number,
        source: (payload.source as "app" | "voice" | "sms" | undefined) ?? "app",
      });
    case "bed.set":
      return setBed({
        facilityId: payload.facilityId as string,
        occupied: payload.occupied as number | undefined,
        total: payload.total as number | undefined,
      });
    case "bed.toggle":
      return toggleBed({
        facilityId: payload.facilityId as string,
        direction: payload.direction as "admit" | "discharge",
      });
    case "test.set":
      return setTestAvailability({
        testId: payload.testId as string,
        isFunctional: payload.isFunctional as boolean,
      });
    case "footfall.increment":
      return incrementFootfall({
        facilityId: payload.facilityId as string,
        date: payload.date as string | undefined,
      });
    case "doctor.checkIn":
      return doctorCheckIn({
        facilityId: payload.facilityId as string,
        geoLat: (payload.geoLat as number | null) ?? null,
        geoLng: (payload.geoLng as number | null) ?? null,
      });
    case "doctor.checkOut":
      return doctorCheckOut();
    default:
      return { ok: false, error: `Unknown action: ${action}` };
  }
}
