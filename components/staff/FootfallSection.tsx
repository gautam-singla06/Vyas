"use client";

import { useState } from "react";
import { useSync } from "@/lib/offline/sync-provider";
import type { FootfallRow } from "@/domain/resource-monitoring/queries";

interface Props {
  initial: FootfallRow | null;
  facilityId: string;
}

export default function FootfallSection({ initial, facilityId }: Props) {
  const { enqueue } = useSync();
  const [count, setCount] = useState<number>(initial?.count ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    const next = count + 1;
    setCount(next); // optimistic
    await enqueue(
      "resource-monitoring",
      "footfall.increment",
      { facilityId },
      (res) => {
        if (!res.ok) {
          setCount(count);
          setError(res.error ?? "Could not record patient");
        } else {
          setCount((res.state?.count as number) ?? next);
        }
        setPending(false);
      }
    );
  }

  return (
    <section className="rounded-ms-md border border-ms-border bg-ms-surface p-5 shadow-card">
      <h2 className="mb-4 font-semibold text-ms-textPrimary">
        <span className="mr-2" aria-hidden="true">🚶</span>Patient Footfall — Today
      </h2>

      {error && (
        <p className="mb-3 rounded-ms-sm border border-[#EDB3B3] bg-critical-tint px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {/* Big number */}
      <div className="mb-5 text-center">
        <span
          className="text-hero font-extrabold tabular-nums text-ms-textPrimary"
          aria-label={`${count} patients today`}
          aria-live="polite"
          aria-atomic="true"
        >
          {count}
        </span>
        <p className="mt-1 text-sm text-ms-textSecondary">patients today</p>
      </div>

      {/* Single + tap button — full width, 56px+ */}
      <button
        id="footfall-add-btn"
        type="button"
        onClick={add}
        disabled={pending}
        aria-label="Add one patient to today's count"
        className="
          ms-press tap-target w-full rounded-ms-sm bg-brand px-4 py-4
          text-base font-semibold text-white shadow-brand
          transition-all hover:bg-brand-hover
          disabled:cursor-not-allowed disabled:opacity-50
          flex items-center justify-center gap-2
        "
        style={{ minHeight: "56px" }}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5" aria-hidden="true">
          <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
        </svg>
        {pending ? "Recording…" : "1 Patient"}
      </button>
    </section>
  );
}
