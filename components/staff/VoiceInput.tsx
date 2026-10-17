"use client";

import { useRef, useState } from "react";
import { useSync } from "@/lib/offline/sync-provider";
import { processVoiceTranscript } from "@/domain/staff/actions";
import type { StockItemRow } from "@/domain/resource-monitoring/queries";

interface ParsedIntent {
  action: "deplete" | "restock" | "lookup" | "unknown" | "deplete_or_restock";
  item: string;
  quantity: number;
  facility?: string;
  confidence: "high" | "low";
}

interface Props {
  facilityId: string;
  language: "en" | "hi";
  items: StockItemRow[];
  // After a successful voice write, refresh the parent's stock list so the UI
  // reflects the (committed-or-optimistically-queued) new quantity. The parent
  // owns the canonical list state.
  onApplied?: (itemName: string, quantity: number) => void;
}

type Phase = "idle" | "listening" | "processing" | "confirm" | "error";

// Minimal ambient TS typings for the Web Speech API — the spec-defined
// `SpeechRecognition` is not in @types/dom yet across all TS versions.
type SpeechRecognitionResult = {
  0: { transcript: string; confidence: number };
  isFinal: boolean;
  length: number;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResult };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceInput({ facilityId, language, items, onApplied }: Props) {
  const { enqueue } = useSync();
  const [phase, setPhase] = useState<Phase>("idle");
  const [parsedForConfirm, setParsedForConfirm] = useState<ParsedIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const supported = !!getRecognitionConstructor();

  // Resolve the parsed item name back to a known stock_item id for this
  // facility (case-insensitive substring match — voice transcripts are fuzzy).
  function resolveItemId(itemName: string): string | null {
    const q = itemName.toLowerCase().trim();
    const exact = items.find((i) => i.item_name.toLowerCase() === q);
    if (exact) return exact.id;
    const partial = items.find((i) => i.item_name.toLowerCase().includes(q) || q.includes(i.item_name.toLowerCase()));
    return partial?.id ?? null;
  }

  async function begin() {
    if (!supported) {
      // Clean fallback: this is the typed-input path. Don't render a broken
      // mic button — leave the typed StockSection untouched. Done in render.
      return;
    }
    setError(null);
    setParsedForConfirm(null);
    setPhase("listening");

    const Ctor = getRecognitionConstructor()!;
    const rec = new Ctor();
    rec.lang = language === "hi" ? "hi-IN" : "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    recRef.current = rec;

    let finalTranscript = "";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
      }
    };
    rec.onerror = () => {
      setPhase("error");
      setError("Microphone error or permission denied.");
    };
    rec.onend = async () => {
      if (!finalTranscript.trim()) {
        setPhase("error");
        setError("Didn't catch that — try again.");
        return;
      }
      setPhase("processing");
      const { intent, responseText } = await processVoiceTranscript(finalTranscript, "voice_" + facilityId);
      if (responseText) {
        setPhase("error");
        setError(responseText);
        return;
      }
      if (!intent) {
        setPhase("error");
        setError("Couldn't understand that update. Try a typed one.");
        return;
      }
      if (intent.confidence === "low" || intent.action === "unknown" || intent.action === "deplete_or_restock") {
        // Low-confidence: NEVER silently write — surface the parsed guess.
        setParsedForConfirm(intent);
        setPhase("confirm");
        return;
      }
      await apply(intent);
    };

    rec.start();
  }

  async function apply(intent: ParsedIntent) {
    const itemId = resolveItemId(intent.item);
    if (!itemId) {
      setPhase("error");
      setError(`No stock item matched "${intent.item}".`);
      return;
    }
    if (intent.action !== "deplete" && intent.action !== "restock") {
      setPhase("error");
      setError("Voice updates only support stock changes here.");
      return;
    }

    // Voice updates route through the SAME queue + Server Action path as a
    // typed one (ADR-003) — source='voice' is the only distinction on the
    // audit trail. We use the absolute restock action (`stock.restock`) so a
    // "Paracetamol khatam" (quantity 0) sets the item to 0 cleanly.
    await enqueue(
      "resource-monitoring",
      "stock.restock",
      { stockItemId: itemId, quantity: intent.quantity, source: "voice" },
      (res) => {
        if (!res.ok) {
          setPhase("error");
          setError(res.error ?? "Voice update failed");
          return;
        }
        setPhase("idle");
        onApplied?.(intent.item, intent.quantity);
      }
    );
  }

  function cancel() {
    setParsedForConfirm(null);
    setPhase("idle");
    if (recRef.current) {
      try { recRef.current.stop(); } catch { /* already stopped */ }
    }
  }

  if (!supported) {
    // Don't render a broken/blocked button on browsers without SpeechRecognition
    // (some Android WebViews). The typed StockSection already covers that case.
    return null;
  }

  const state = {
    idle: "Voice",
    listening: "Listening…",
    processing: "Understanding…",
    confirm: "Confirm?",
    error: "Retry",
  }[phase];

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={phase === "idle" || phase === "error" ? begin : cancel}
        aria-label="Voice update"
        className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
          phase === "listening"
            ? "bg-red-600 text-white animate-pulse"
            : phase === "processing"
            ? "bg-sky-600 text-white"
            : phase === "confirm"
            ? "bg-amber-500 text-white"
            : "border border-ms-border bg-ms-surface text-ms-textPrimary hover:bg-ms-surface2"
        }`}
      >
        <span aria-hidden>🎙️</span>
        {state}
      </button>

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {phase === "confirm" && parsedForConfirm && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            Did you mean: <span className="underline">{parsedForConfirm.item}</span>,{" "}
            {parsedForConfirm.action === "deplete" ? "set stock to" : "restock to"}{" "}
            <strong>{parsedForConfirm.quantity}</strong>?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => apply(parsedForConfirm)}
              className="rounded-md bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-ms-border px-3 py-1 text-sm hover:bg-ms-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
