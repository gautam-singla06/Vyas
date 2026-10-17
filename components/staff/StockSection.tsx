"use client";

import { useState, useMemo } from "react";
import { useSync } from "@/lib/offline/sync-provider";
import type { StockItemRow } from "@/domain/resource-monitoring/queries";
import type { ActionKey } from "@/domain/types";
import VoiceInput from "./VoiceInput";

interface Props {
  initial: StockItemRow[];
  facilityId: string;
}

export default function StockSection({ initial, facilityId }: Props) {
  const { enqueue } = useSync();
  const [items, setItems] = useState<StockItemRow[]>(initial);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.item_name.toLowerCase().includes(q));
  }, [items, query]);

  async function adjust(itemId: string, currentQty: number, delta: number) {
    setPending((p) => ({ ...p, [itemId]: true }));
    setError(null);
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
      )
    );
    const action: ActionKey = "stock.adjust";
    await enqueue(
      "resource-monitoring",
      action,
      { stockItemId: itemId, delta, source: "app" },
      (res) => {
        if (!res.ok) {
          setItems((prev) =>
            prev.map((i) => (i.id === itemId ? { ...i, quantity: currentQty } : i))
          );
          setError(res.error ?? "Update failed");
        } else if (res.state?.quantity !== undefined) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === itemId
                ? { ...i, quantity: res.state!.quantity as number }
                : i
            )
          );
        }
        setPending((p) => {
          const next = { ...p };
          delete next[itemId];
          return next;
        });
      }
    );
  }

  return (
    <section className="rounded-ms-md border border-ms-border bg-ms-surface p-5 shadow-card">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-ms-textPrimary">
          <span className="mr-2" aria-hidden="true">💊</span>Stock
        </h2>
        <span className="text-xs text-ms-textDisabled">{items.length} items</span>
      </div>

      {/* Search + Voice row */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ms-textDisabled"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M9.965 11.026a5 5 0 111.06-1.06l2.755 2.754a.75.75 0 11-1.06 1.06l-2.755-2.754zM10.5 7a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z" clipRule="evenodd"/>
          </svg>
          <input
            id="stock-search"
            type="search"
            placeholder="Search medicines…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="
              w-full rounded-ms-sm border border-ms-border bg-ms-bg py-3 pl-9 pr-3
              text-sm text-ms-textPrimary placeholder:text-ms-textDisabled
              focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20
            "
            style={{ minHeight: "48px" }}
          />
        </div>
        <VoiceInput
          facilityId={facilityId}
          language="hi"
          items={items}
          onApplied={(itemName, quantity) =>
            setItems((prev) =>
              prev.map((i) =>
                i.item_name.toLowerCase() === itemName.toLowerCase()
                  ? { ...i, quantity }
                  : i
              )
            )
          }
        />
      </div>

      {error && (
        <p className="mb-3 rounded-ms-sm border border-[#EDB3B3] bg-critical-tint px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-ms-textSecondary">No items found.</p>
      ) : (
        <ul className="divide-y divide-ms-border">
          {filtered.map((item) => {
            const isLow = item.quantity <= 10;
            return (
              <li
                key={item.id}
                className={`flex items-center justify-between py-3 transition-opacity ${
                  pending[item.id] ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ms-textPrimary">{item.item_name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-sm text-ms-textSecondary">
                      {item.quantity} {item.unit}
                    </span>
                    {isLow && (
                      <span className="flex items-center gap-1 rounded-full border border-[#E8C97A] bg-warning-tint px-2 py-0.5 text-xs font-semibold text-warning">
                        <svg viewBox="0 0 10 10" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
                          <path fillRule="evenodd" d="M5 1a4 4 0 100 8A4 4 0 005 1zM4.25 2.75a.75.75 0 011.5 0v2a.75.75 0 01-1.5 0v-2zm.75 4.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
                        </svg>
                        Low
                      </span>
                    )}
                  </div>
                </div>

                {/* +/- stepper */}
                <div className="ml-3 flex flex-shrink-0 items-center gap-1">
                  <button
                    id={`stock-minus-${item.id}`}
                    type="button"
                    aria-label={`Decrease ${item.item_name}`}
                    onClick={() => adjust(item.id, item.quantity, -1)}
                    disabled={!!pending[item.id] || item.quantity <= 0}
                    className="
                      ms-press flex h-11 w-11 items-center justify-center rounded-full
                      border border-ms-border bg-ms-bg text-ms-textPrimary
                      transition-all hover:border-brand hover:bg-brand-tint hover:text-brand
                      disabled:cursor-not-allowed disabled:opacity-40
                    "
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M2 8a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H2.75A.75.75 0 012 8z"/>
                    </svg>
                  </button>

                  <span
                    className="w-10 text-center text-lg font-bold tabular-nums text-ms-textPrimary"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {item.quantity}
                  </span>

                  <button
                    id={`stock-plus-${item.id}`}
                    type="button"
                    aria-label={`Increase ${item.item_name}`}
                    onClick={() => adjust(item.id, item.quantity, 1)}
                    disabled={!!pending[item.id]}
                    className="
                      ms-press flex h-11 w-11 items-center justify-center rounded-full
                      border border-ms-border bg-ms-bg text-ms-textPrimary
                      transition-all hover:border-brand hover:bg-brand-tint hover:text-brand
                      disabled:cursor-not-allowed disabled:opacity-40
                    "
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
