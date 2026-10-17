// Result + action-envelope types shared across all Resource Monitoring
// Server Actions and the offline queue (Phase 5).
//
// Design: every write Server Action returns a deterministic ActionResult so the
// offline queue can replay a queued call with the EXACT same payload shape it
// would have sent live. The `actionKey` is a stable string identifying which
// Server Action to invoke on replay (see lib/offline/replay.ts).

export type ActionKey =
  | "stock.adjust"
  | "stock.restock"
  | "bed.set"
  | "bed.toggle"
  | "test.set"
  | "footfall.increment"
  | "doctor.checkIn"
  | "doctor.checkOut";

export interface ActionResult {
  ok: boolean;
  error?: string;
  // The committed-after state so the UI's optimistic update can be reconciled.
  state?: Record<string, unknown>;
}

// The IndexedDB queue row shape lives in lib/offline/db.ts (QueuedRow) — it is
// the single canonical envelope stored and replayed. (An earlier duplicate
// `QueuedAction` interface here was unused and has been removed.)

// by anything enumerating the staff-data-entry actions. Lives here (not in a
// "use server" file) so importing it never breaks Server-Action bundling rules.
