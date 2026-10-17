"use client";

import { useState } from "react";
import { useSync } from "@/lib/offline/sync-provider";
import type { BedStatusRow } from "@/domain/resource-monitoring/queries";

interface Props {
  initial: BedStatusRow | null;
  facilityId: string;
}

export default function BedSection({ initial, facilityId }: Props) {
  const { enqueue } = useSync();
  const [bed, setBed] = useState<BedStatusRow | null>(initial);
  const [pending, setPending] = useState<"admit" | "discharge" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(direction: "admit" | "discharge") {
    setPending(direction);
    setError(null);
    setBed((prev) => {
      if (!prev) return prev;
      const occupied =
        direction === "admit"
          ? Math.min(prev.total, prev.occupied + 1)
          : Math.max(0, prev.occupied - 1);
      return { ...prev, occupied, available: prev.total - occupied };
    });
    await enqueue(
      "resource-monitoring",
      "bed.toggle",
      { facilityId, direction },
      (res) => {
        if (!res.ok) {
          setBed(initial);
          setError(res.error ?? "Update failed");
        } else if (res.state) {
          setBed({
            facility_id: res.state.facilityId as string,
            total: res.state.total as number,
            occupied: res.state.occupied as number,
            available: (res.state.total as number) - (res.state.occupied as number),
          });
        }
        setPending(null);
      }
    );
  }

  const full = bed ? bed.available === 0 : false;
  const pct  = bed && bed.total > 0 ? Math.round((bed.occupied / bed.total) * 100) : 0;

  return (
    <section className="rounded-ms-md border border-ms-border bg-ms-surface p-5 shadow-card">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-ms-textPrimary">
          <span className="mr-2" aria-hidden="true">🛏</span>Beds
        </h2>
        {full && (
          <span className="flex items-center gap-1 rounded-full border border-[#EDB3B3] bg-critical-tint px-3 py-1 text-xs font-semibold text-critical">
            <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3" aria-hidden="true">
              <path fillRule="evenodd" d="M6 1a5 5 0 100 10A5 5 0 006 1zM5.25 3.5a.75.75 0 011.5 0v2.75a.75.75 0 01-1.5 0V3.5zm.75 5.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
            </svg>
            Full
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-ms-sm border border-[#EDB3B3] bg-critical-tint px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {!bed ? (
        <p className="py-4 text-center text-sm text-ms-textSecondary">No bed status recorded yet.</p>
      ) : (
        <>
          {/* Big number display */}
          <div className="mb-4 text-center">
            <span className="text-hero font-extrabold tabular-nums text-ms-textPrimary">
              {bed.available}
            </span>
            <span className="ml-2 text-base text-ms-textSecondary">
              of {bed.total} free
            </span>
            <p className="mt-0.5 text-sm text-ms-textDisabled">{bed.occupied} occupied</p>
          </div>

          {/* Occupancy progress bar */}
          <div className="mb-5 overflow-hidden rounded-full bg-ms-surface2 h-2.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% occupied`}>
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                pct >= 90 ? "bg-critical" : pct >= 70 ? "bg-warning" : "bg-watch"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Tap buttons — min 48px */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="bed-admit-btn"
              type="button"
              onClick={() => handle("admit")}
              disabled={pending !== null || full}
              aria-label="Mark one bed as occupied"
              className="
                ms-press tap-target flex items-center justify-center gap-2
                rounded-ms-sm bg-brand px-4 py-3.5 font-semibold text-white
                shadow-brand transition-all hover:bg-brand-hover
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
              </svg>
              {pending === "admit" ? "Saving…" : "Occupied"}
            </button>
            <button
              id="bed-discharge-btn"
              type="button"
              onClick={() => handle("discharge")}
              disabled={pending !== null || bed.occupied === 0}
              aria-label="Mark one bed as free"
              className="
                ms-press tap-target flex items-center justify-center gap-2
                rounded-ms-sm border border-ms-border px-4 py-3.5 font-semibold
                text-ms-textPrimary transition-all hover:bg-ms-surface2
                disabled:cursor-not-allowed disabled:opacity-40
              "
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M2 8a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 8z"/>
              </svg>
              {pending === "discharge" ? "Saving…" : "Free"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
