"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSync } from "@/lib/offline/sync-provider";
import { createClient } from "@/lib/supabase/client";
import SeverityBadge from "./SeverityBadge";
import { updateSuggestionStatus, resolveFlag } from "@/domain/admin/actions";
import type { FlagRow, SuggestionRow } from "@/domain/admin/queries";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  initialFlags: FlagRow[];
  initialSuggestions: SuggestionRow[];
}

export default function FlagsList({ initialFlags, initialSuggestions }: Props) {
  const { language, t } = useLanguage();
  const [flags, setFlags] = useState<FlagRow[]>(initialFlags);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>(initialSuggestions);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [newFlagIds, setNewFlagIds] = useState<Set<string>>(new Set());
  const { online } = useSync();
  const prevFlagIds = useRef<Set<string>>(new Set(initialFlags.map(f => f.id)));

  const refreshFlags = useCallback(async () => {
    const res = await fetch("/api/admin/flags", { method: "POST" });
    if (!res.ok) return;
    const data = (await res.json()) as { flags: FlagRow[] };
    if (!data?.flags) return;
    const incoming = new Set(data.flags.map(f => f.id));
    const arrived = data.flags.filter(f => !prevFlagIds.current.has(f.id)).map(f => f.id);
    if (arrived.length) {
      setNewFlagIds(prev => new Set([...prev, ...arrived]));
      setTimeout(() => setNewFlagIds(prev => {
        const next = new Set(prev);
        arrived.forEach(id => next.delete(id));
        return next;
      }), 1500);
    }
    prevFlagIds.current = incoming;
    setFlags(data.flags);
  }, []);

  useEffect(() => {
    try {
      const supabase = createClient();
      const channel = supabase
        .channel("flags-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "flags" }, () => {
          void refreshFlags();
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } catch { /* no supabase env in build */ }
  }, [refreshFlags]);

  const reasonFor = (f: FlagRow) => {
    const text = language === "hi" ? f.reason_text_hi : f.reason_text_en;
    if (text) return text;
    switch (f.category) {
      case "stock":  return `${t.flag_stock} (${t[`severity_${f.severity}` as keyof typeof t]}). ${t.ai_pending}`;
      case "bed":    return `${t.flag_bed} (${t[`severity_${f.severity}` as keyof typeof t]}).`;
      case "doctor": return `${t.flag_doctor} (${t[`severity_${f.severity}` as keyof typeof t]}).`;
      case "test":   return `${t.flag_test} (${t[`severity_${f.severity}` as keyof typeof t]}).`;
      default:       return `${t.flag_general} (${t[`severity_${f.severity}` as keyof typeof t]}).`;
    }
  };

  const shadowMap: Record<string, string> = {
    critical: "shadow-critical",
    warning:  "shadow-warning",
    watch:    "shadow-[0_2px_8px_rgba(0,0,0,0.06),0_4px_16px_rgba(46,139,87,0.18)]",
  };

  async function handleSuggestion(id: string, status: "actioned" | "dismissed") {
    setBusy(b => ({ ...b, [`s:${id}`]: true }));
    const res = await updateSuggestionStatus(id, status);
    if (res.ok) setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    setBusy(b => { const next = { ...b }; delete next[`s:${id}`]; return next; });
  }

  async function handleResolveFlag(id: string) {
    setBusy(b => ({ ...b, [`f:${id}`]: true }));
    const res = await resolveFlag(id);
    if (res.ok) setFlags(prev => prev.filter(f => f.id !== id));
    setBusy(b => { const next = { ...b }; delete next[`f:${id}`]; return next; });
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-admin-lg font-semibold text-ms-textPrimary">{t.live_alerts}</h2>
          <span className={`flex items-center gap-1.5 text-admin-xs ${
            online ? "text-watch" : "text-warning"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              online ? "bg-watch animate-pulse" : "bg-warning"
            }`} aria-hidden="true" />
            {online ? t.real_time : t.offline_refresh}
          </span>
        </div>

        {flags.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-ms-md border border-dashed border-ms-border bg-ms-surface p-10 text-center">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-ms-textDisabled" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-admin-sm font-medium text-ms-textSecondary">{t.no_alerts}</p>
          </div>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {flags.map((f) => (
              <li
                key={f.id}
                className={`
                  ms-tilt-card rounded-ms-md border border-ms-border bg-ms-surface p-4
                  ${shadowMap[f.severity] ?? "shadow-card"}
                  ${newFlagIds.has(f.id) ? "animate-slide-in ms-highlight-pulse" : ""}
                `}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                  const y = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
                  e.currentTarget.style.transform = `perspective(800px) rotateY(${x * 2}deg) rotateX(${-y * 2}deg) scale(1.005)`;
                }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ms-textPrimary">{f.facility_name}</p>
                    <p className="mt-0.5 text-admin-xs uppercase tracking-wide text-ms-textDisabled">{f.category}</p>
                  </div>
                  <SeverityBadge severity={f.severity} />
                </div>
                <p className={`mt-2 text-admin-sm text-ms-textSecondary ${
                  language === "hi" ? "font-hindi" : ""
                }`}>{reasonFor(f)}</p>
                <div className="mt-3 flex items-center justify-between text-admin-xs text-ms-textDisabled">
                  <span>{new Date(f.created_at).toLocaleString()}</span>
                  <button
                    id={`resolve-flag-${f.id}`}
                    type="button"
                    onClick={() => handleResolveFlag(f.id)}
                    disabled={!!busy[`f:${f.id}`]}
                    className="rounded-ms-sm border border-ms-border px-3 py-1.5 transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    {busy[`f:${f.id}`] ? t.resolving : t.mark_resolved}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-admin-lg font-semibold text-ms-textPrimary">{t.redistribution}</h2>
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-ms-md border border-dashed border-ms-border bg-ms-surface p-8 text-center">
            <p className="text-admin-sm text-ms-textSecondary">{t.no_redist}</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s) => (
              <li
                key={s.id}
                className="ms-tilt-card rounded-ms-md border border-ms-border bg-ms-surface p-4 shadow-card"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                  const y = ((e.clientY - rect.top)  / rect.height - 0.5) * 2;
                  e.currentTarget.style.transform = `perspective(800px) rotateY(${x * 2}deg) rotateX(${-y * 2}deg) scale(1.005)`;
                }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; }}
              >
                <p className="font-semibold text-ms-textPrimary">{s.item_name}</p>
                <div className="mt-2 flex items-center gap-1.5 text-admin-xs text-ms-textSecondary">
                  <span className="truncate">{s.from_facility_name}</span>
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 flex-shrink-0" aria-hidden="true">
                    <path fillRule="evenodd" d="M2 8a.75.75 0 01.75-.75h8.69L8.22 4.03a.75.75 0 011.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 01-1.06-1.06l3.22-3.22H2.75A.75.75 0 012 8z" clipRule="evenodd"/>
                  </svg>
                  <span className="truncate">{s.to_facility_name}</span>
                </div>
                <p className="mt-1 text-admin-xs text-ms-textSecondary">
                  {t.qty}: <strong>{s.suggested_qty}</strong> · {s.distance_km} km
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    id={`action-suggestion-${s.id}`}
                    type="button"
                    onClick={() => handleSuggestion(s.id, "actioned")}
                    disabled={!!busy[`s:${s.id}`] || s.status !== "pending"}
                    className="flex-1 rounded-ms-sm bg-brand px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-40"
                  >
                    ✓ {t.actioned}
                  </button>
                  <button
                    id={`dismiss-suggestion-${s.id}`}
                    type="button"
                    onClick={() => handleSuggestion(s.id, "dismissed")}
                    disabled={!!busy[`s:${s.id}`] || s.status !== "pending"}
                    className="flex-1 rounded-ms-sm border border-ms-border px-3 py-2 text-xs font-medium transition-colors hover:bg-ms-surface2 disabled:opacity-40"
                  >
                    {t.dismiss}
                  </button>
                  {s.status !== "pending" && (
                    <span className="self-center text-xs font-medium uppercase text-ms-textDisabled">
                      {s.status === "actioned" ? t.actioned : (s.status === "dismissed" ? t.dismiss : t.pending)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
