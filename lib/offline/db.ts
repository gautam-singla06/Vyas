import Dexie, { type Table } from "dexie";

// Offline-first write queue (Phase 5, ADR-003). Mirrors BUILD.md's schema:
//   { id, domain, action, payload, createdAt, synced }
// `domain` is the bounded context (e.g. "resource-monitoring"); `action` is
// the ActionKey string identifying which Server Action to invoke on replay.
// Last-write-wins conflict handling is applied at the DB row level inside
// each Server Action — there is no merge/UI here by design.

export interface QueuedRow {
  id?: number;            // autoincrement
  domain: string;         // bounded context: resource-monitoring | workforce
  action: string;         // ActionKey — see domain/types.ts
  payload: Record<string, unknown>;
  createdAt: number;
  synced: boolean;
}

class VyasDB extends Dexie {
  writeQueue!: Table<QueuedRow, number>;

  constructor() {
    super("vyas");
    this.version(1).stores({
      writeQueue: "++id, domain, action, synced, createdAt",
    });
  }
}

// Singleton DB handle. Constructed lazily so SSR / build (no `indexedDB`)
// never instantiates it.
let dbInstance: VyasDB | null = null;
export function getDB(): VyasDB {
  if (!dbInstance) dbInstance = new VyasDB();
  return dbInstance;
}
