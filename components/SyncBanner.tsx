"use client";

import { useSync } from "@/lib/offline/sync-provider";
import { useEffect, useState } from "react";

// Persistent top strip — ALWAYS visible when offline (ADR-003 / UI&UX.md §7).
// Two states only: amber "Offline — N queued" or green "Synced ✓" (brief, then hides).
// 150ms cross-fade text, no slide/bounce per motion spec.
export default function SyncBanner() {
  const { online, queueLength } = useSync();
  const [showSynced, setShowSynced] = useState(false);
  const [prevOnline, setPrevOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (prevOnline === false && online) {
      // Just came back online — flash the synced banner
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 2500);
      return () => clearTimeout(t);
    }
    setPrevOnline(online);
  }, [online, prevOnline]);

  const visible = !online || showSynced;

  // Reserve the fixed banner's height (via a class on <html>) whenever it's
  // shown, so it doesn't overlap the sticky page headers (see globals.css).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("ms-has-banner", visible);
    return () => root.classList.remove("ms-has-banner");
  }, [visible]);

  // Fully hidden when online and not in "just-synced" flash state
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`
        ms-sync-banner fixed inset-x-0 top-0 z-[60] flex items-center justify-center
        gap-2 px-4 py-2.5 text-sm font-medium ms-xfade
        ${online
          ? "bg-watch-tint text-watch"
          : "bg-warning-tint text-warning"
        }
      `}
    >
      {online ? (
        <>
          {/* Green: synced */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
            <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" clipRule="evenodd"/>
          </svg>
          <span>Synced — all changes saved</span>
        </>
      ) : (
        <>
          {/* Amber: offline with queue count */}
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 flex-shrink-0" aria-hidden="true">
            <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm8-3.25a.75.75 0 01.75.75v3.25h1.5a.75.75 0 010 1.5h-2.25A.75.75 0 017.25 9.5V6.5A.75.75 0 018 5.75z" clipRule="evenodd"/>
          </svg>
          <span>
            Offline
            {queueLength > 0 && (
              <> — <strong>{queueLength}</strong> action{queueLength !== 1 ? "s" : ""} queued, will sync on reconnect</>
            )}
          </span>
        </>
      )}
    </div>
  );
}
