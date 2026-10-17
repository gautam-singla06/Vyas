"use client";

import { useState } from "react";
import { useSync } from "@/lib/offline/sync-provider";
import type { TestRow } from "@/domain/resource-monitoring/queries";

interface Props {
  initial: TestRow[];
}

export default function TestSection({ initial }: Props) {
  const { enqueue } = useSync();
  const [tests, setTests] = useState<TestRow[]>(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(test: TestRow) {
    const next = !test.is_functional;
    setPending(test.id);
    setError(null);
    setTests((prev) =>
      prev.map((t) => (t.id === test.id ? { ...t, is_functional: next } : t))
    );
    await enqueue(
      "resource-monitoring",
      "test.set",
      { testId: test.id, isFunctional: next },
      (res) => {
        if (!res.ok) {
          setTests((prev) =>
            prev.map((t) =>
              t.id === test.id ? { ...t, is_functional: test.is_functional } : t
            )
          );
          setError(res.error ?? "Update failed");
        }
        setPending(null);
      }
    );
  }

  return (
    <section className="rounded-ms-md border border-ms-border bg-ms-surface p-5 shadow-card">
      <h2 className="mb-4 font-semibold text-ms-textPrimary">
        <span className="mr-2" aria-hidden="true">🔬</span>Tests & Equipment
      </h2>

      {error && (
        <p className="mb-3 rounded-ms-sm border border-[#EDB3B3] bg-critical-tint px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {tests.length === 0 ? (
        <p className="py-4 text-center text-sm text-ms-textSecondary">
          No tests recorded for your facility.
        </p>
      ) : (
        <ul className="divide-y divide-ms-border">
          {tests.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Status dot */}
                <span
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                    t.is_functional ? "bg-watch" : "bg-critical"
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate font-medium text-ms-textPrimary">
                  {t.test_name}
                </span>
              </div>

              {/* Toggle button — 48px min */}
              <button
                id={`test-toggle-${t.id}`}
                type="button"
                onClick={() => toggle(t)}
                disabled={pending === t.id}
                aria-pressed={t.is_functional}
                aria-label={`${t.test_name}: currently ${t.is_functional ? "functional" : "down"}. Tap to toggle.`}
                className={`
                  ms-press ml-3 flex flex-shrink-0 items-center gap-1.5 rounded-full
                  border px-4 py-2 text-sm font-semibold transition-all
                  tap-target-sm
                  ${t.is_functional
                    ? "border-[#B8E2CA] bg-watch-tint text-watch hover:bg-[#D4EDDE]"
                    : "border-[#EDB3B3] bg-critical-tint text-critical hover:bg-[#F5D0D0]"
                  }
                  disabled:cursor-not-allowed disabled:opacity-50
                `}
              >
                {t.is_functional ? (
                  <>
                    <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                      <path fillRule="evenodd" d="M10.03 3.22a.75.75 0 010 1.06L5.5 8.81 2.97 6.28a.75.75 0 011.06-1.06L5.5 6.69l3.47-3.47a.75.75 0 011.06 0z" clipRule="evenodd"/>
                    </svg>
                    Functional
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                      <path fillRule="evenodd" d="M6 1a5 5 0 100 10A5 5 0 006 1zM5.25 3.5a.75.75 0 011.5 0v2.75a.75.75 0 01-1.5 0V3.5zm.75 5.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
                    </svg>
                    Down
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
