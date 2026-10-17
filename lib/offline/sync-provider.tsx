"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getDB, type QueuedRow } from "@/lib/offline/db";
import { replayAction } from "@/lib/offline/replay";
import type { ActionKey, ActionResult } from "@/domain/types";

interface SyncState {
  online: boolean;
  queueLength: number;
  flushing: boolean;
  lastError?: string;
}

interface SyncContextValue extends SyncState {
  // Enqueue a write action. Returns immediately after the optimistic UI
  // update expectation — the queue flushes on reconnect. Also attempts one
  // immediate sync if currently online (never blocks the caller).
  enqueue: (
    domain: string,
    action: ActionKey,
    payload: Record<string, unknown>,
    onResult?: (res: ActionResult) => void
  ) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncState>({
    online: true, // Always true on first render to match server (hydration)
    queueLength: 0,
    flushing: false,
  });
  const flushingRef = useRef(false);

  const refreshQueueLength = useCallback(async () => {
    try {
      const db = getDB();
      // `synced` is boolean and indexed; Dexie stored booleans coerce. Use a
      // collection filter since boolean equality on the index is fiddly.
      const unsynced = await db.writeQueue
        .filter((r) => !r.synced)
        .count();
      setState((s) => ({ ...s, queueLength: unsynced }));
    } catch {
      // IndexedDB unavailable (SSR / private mode). Queue still logically
      // exists only when there's something to sync; surface 0.
      setState((s) => ({ ...s, queueLength: 0 }));
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    flushingRef.current = true;
    setState((s) => ({ ...s, flushing: true }));

    try {
      const db = getDB();
      // Flush in creation order, one at a time, so the audit trail order in
      // stock_logs matches the order the user actually performed the actions.
      const pending = await db.writeQueue
        .orderBy("createdAt")
        .filter((r) => !r.synced)
        .toArray();

      for (const row of pending) {
        try {
          const res = await replayAction(
            row.action as ActionKey,
            row.payload
          );
          if (res.ok) {
            await db.writeQueue.delete(row.id!);
          } else {
            // Non-recoverable error (e.g., "stock item not found", "occupied > total"):
            // don't retry forever — mark as needs attention by leaving the row
            // but recording lastError. A human re-enters. For now we delete to
            // avoid an unbounded poison queue, and surface the error on the banner.
            await db.writeQueue.delete(row.id!);
            setState((s) => ({ ...s, lastError: res.error }));
          }
        } catch (err) {
          // Transient (network) error — keep the row; the next flush retries.
          flushStateFromError(err);
          break;
        }
      }
    } finally {
      flushingRef.current = false;
      setState((s) => ({ ...s, flushing: false }));
      refreshQueueLength();
    }
  }, [refreshQueueLength]);

  // Function reference helper to read current flushing state from closures.
  const flushStateFromError = (_e: unknown) => {
    setState((s) => ({ ...s, lastError: "Network error — will retry" }));
  };

  const enqueue = useCallback<SyncContextValue["enqueue"]>(
    async (domain, action, payload, onResult) => {
      // 1. Enqueue in IndexedDB first — durable even if the immediate sync below
      //    fails. This is the heart of ADR-003's offline-first guarantee.
      let newRowId: number;
      try {
        const db = getDB();
        // add() returns the autoincrement key of the row it just inserted, so
        // we can delete exactly that row on success — no need to scan the queue.
        newRowId = await db.writeQueue.add({
          domain,
          action,
          payload,
          createdAt: Date.now(),
          synced: false,
        } as QueuedRow);
        refreshQueueLength();
      } catch {
        // If IndexedDB is unavailable, fall back to a live direct call so the
        // feature still works online — the offline guarantee only applies when
        // the browser actually supports IndexedDB.
        const res = await replayAction(action, payload);
        onResult?.(res);
        return;
      }

      // 2. Attempt an immediate sync if online, non-blocking. The result is
      //    routed to the caller via onResult once it resolves (so an optimistic
      //    update can be reconciled). Offline => the queued row waits for the
      //    flusher.
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const db = getDB();
        try {
          const res = await replayAction(action, payload);
          if (res.ok) {
            await db.writeQueue.delete(newRowId);
            refreshQueueLength();
          }
          onResult?.(res);
        } catch (err) {
          flushStateFromError(err);
        }
      }
    },
    [refreshQueueLength]
  );

  // Wire browser events + periodic fallback. The initial queue-length seed
  // is read inside an async IIFE so its setState lands after an await, not
  // synchronously in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    // Reconcile initial hydration state (which is always true) with actual network state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((s) => ({ ...s, online: false }));
    }

    void (async () => {
      await refreshQueueLength();
    })();

    const goOnline = () => {
      setState((s) => ({ ...s, online: true }));
      flush();
    };
    const goOffline = () => setState((s) => ({ ...s, online: false }));

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Periodic fallback flush — covers the case where 'online' already fired
    // before the provider mounted, or a fetch came back reachable again.
    const interval = window.setInterval(() => {
      if (navigator.onLine) flush();
    }, 30_000);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.clearInterval(interval);
    };
  }, [flush, refreshQueueLength]);

  const value = useMemo<SyncContextValue>(
    () => ({ ...state, enqueue }),
    [state, enqueue]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used within <SyncProvider>");
  }
  return ctx;
}
