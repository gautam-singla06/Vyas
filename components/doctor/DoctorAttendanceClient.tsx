"use client";

import { useState } from "react";
import { useSync } from "@/lib/offline/sync-provider";

interface Props {
  facilityId: string;
  initialOpen: boolean;
  initialCheckIn?: string;
}

type Phase = "idle" | "locating" | "submitting" | "error";

export default function DoctorAttendanceClient({
  facilityId,
  initialOpen,
  initialCheckIn,
}: Props) {
  const { enqueue } = useSync();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  function getPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  async function handleCheckIn() {
    setPhase("locating");
    setError(null);
    const geo = await getPosition();
    setPhase("submitting");
    setIsOpen(true);
    setCheckIn(new Date().toISOString());
    await enqueue(
      "workforce",
      "doctor.checkIn",
      { facilityId, geoLat: geo?.lat ?? null, geoLng: geo?.lng ?? null },
      (res) => {
        if (!res.ok) {
          setIsOpen(false);
          setCheckIn(undefined);
          setPhase("error");
          setError(res.error ?? "Check-in failed");
        } else {
          setPhase("idle");
        }
      }
    );
  }

  async function handleCheckOut() {
    setPhase("submitting");
    setError(null);
    setIsOpen(false);
    setCheckIn(undefined);
    await enqueue("workforce", "doctor.checkOut", {}, (res) => {
      if (!res.ok) {
        setIsOpen(true);
        setCheckIn(initialCheckIn);
        setPhase("error");
        setError(res.error ?? "Check-out failed");
      } else {
        setPhase("idle");
      }
    });
  }

  const busy = phase === "locating" || phase === "submitting";

  return (
    <div className="mx-auto max-w-field space-y-4">
      {/* Status card */}
      <div className={`rounded-ms-md border p-6 text-center ${
        isOpen
          ? "border-[#B8E2CA] bg-watch-tint"
          : "border-ms-border bg-ms-surface"
      } shadow-card`}>
        {/* Status icon */}
        <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
          isOpen ? "bg-watch text-white" : "bg-ms-surface2 text-ms-textDisabled"
        } shadow-card`}>
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {isOpen ? (
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            ) : (
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            )}
          </svg>
        </div>

        <h1 className="text-section font-bold text-ms-textPrimary">Attendance</h1>

        {isOpen && checkIn ? (
          <div className="mt-2">
            <p className="text-base font-semibold text-watch">Checked in</p>
            <p className="mt-0.5 text-sm text-ms-textSecondary">
              at {new Date(checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-base text-ms-textSecondary">Not checked in today</p>
        )}

        {/* Geo indicator */}
        {phase === "locating" && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-ms-textSecondary">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 animate-pulse text-brand" aria-hidden="true">
              <path fillRule="evenodd" d="M8 0C5.243 0 3 2.243 3 5c0 2.67 4.196 8.578 4.385 8.829a.75.75 0 001.23 0C8.804 13.578 13 7.67 13 5c0-2.757-2.243-5-5-5zm0 7a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
            </svg>
            Capturing location… check-in proceeds even without permission.
          </p>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-ms-sm border border-[#EDB3B3] bg-critical-tint px-4 py-3 text-sm text-critical ms-xfade">
          {error}
        </div>
      )}

      {/* Action button — full width, 64px */}
      <button
        id="doctor-checkin-btn"
        type="button"
        onClick={isOpen ? handleCheckOut : handleCheckIn}
        disabled={busy}
        aria-label={isOpen ? "Check out" : "Check in"}
        className={`
          ms-press w-full rounded-ms-md px-4 py-5 text-lg font-bold text-white
          shadow-lg transition-all hover:shadow-xl active:scale-[0.98]
          disabled:cursor-not-allowed disabled:opacity-50
          flex items-center justify-center gap-3
          ${isOpen
            ? "bg-critical shadow-[0_4px_20px_rgba(214,69,69,0.25)] hover:bg-red-700"
            : "bg-brand shadow-brand hover:bg-brand-hover"
          }
        `}
        style={{ minHeight: "64px" }}
      >
        {busy ? (
          <>
            <Spinner />
            {phase === "locating" ? "Getting location…" : "Saving…"}
          </>
        ) : isOpen ? (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a7 7 0 1014 0A7 7 0 003 10zm11.03-2.47a.75.75 0 010 1.06l-2.5 2.5a.75.75 0 01-1.06-1.06L12.44 9H6.5a.75.75 0 010-1.5h5.94l-1.97-1.97a.75.75 0 111.06-1.06l2.5 2.5z" clipRule="evenodd"/>
            </svg>
            Check Out
          </>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path fillRule="evenodd" d="M3 10a7 7 0 1014 0A7 7 0 003 10zm7-5.75a.75.75 0 01.75.75v3.75h3.75a.75.75 0 010 1.5h-3.75v3.75a.75.75 0 01-1.5 0v-3.75H5.5a.75.75 0 010-1.5h3.75V5a.75.75 0 01.75-.75z" clipRule="evenodd"/>
            </svg>
            Check In
          </>
        )}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}
