// NOTE: intentionally NOT a "use server" module. These are internal server-side
// helpers (called from the flagging runner and the AI agent), not form/button
// Server Actions. Marking the file "use server" would expose complete() and
// generateFlagExplanation() as client-callable endpoints — an open proxy for
// arbitrary LLM calls through our key. Keep them as ordinary server imports.

import { createServiceClient } from "@/lib/supabase/server";

// ===========================================================================
// Generative layer — Stage 3 of the AI pipeline (DESIGN.md §7, ADR-006).
// Gemini via Google AI Studio API. 
//
// Failure isolation (ADR-005): the deterministic forecast/flagging logic in
// Phase 6/7 does NOT call this module. Downstream callers (the flagging
// runner, the dashboard, the chatbot) invoke these lazily and degrade
// gracefully: a Gemini outage leaves the raw number/severity in place; only
// the friendly sentence is missing.
// ===========================================================================

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

// Centralized, typed completion caller. Throws on network/HTTP/parse failure;
// every public function below wraps it in try/catch so its own contract is
// "return null on failure, never throw".
export async function complete(
  messages: LLMMessage[],
  opts: { 
    maxTokens?: number; 
    temperature?: number; 
    responseJson?: boolean;
    tools?: Array<{
      type: "function";
      function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
    }>;
  } = {}
): Promise<{ text: string | null; tool_calls?: LLMMessage["tool_calls"] }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_GENERATIVE_AI_API_KEY not set — generative AI degraded");
    return { text: null };
  }

  const body = {
    model: MODEL,
    messages,
    max_tokens: opts.maxTokens ?? 256,
    temperature: opts.temperature ?? 0.2,
    ...(opts.responseJson ? { response_format: { type: "json_object" } } : {}),
    ...(opts.tools ? { tools: opts.tools } : {}),
  };

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "Vyas",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Gemini API HTTP Error", res.status, await res.text().catch(() => ""));
      return { text: null };
    }
    const data = await res.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) return { text: null };

    return { 
      text: typeof msg.content === "string" ? msg.content : null,
      tool_calls: msg.tool_calls
    };
  } catch (err) {
    console.error("Gemini fetch failed", err);
    return { text: null };
  }
}

// ---------------------------------------------------------------------------
// Function 1 — Explanation Generator (Backend Event Triggered)
// ---------------------------------------------------------------------------
export interface FlagExplanationInput {
  flagId: string;
  category: "stock" | "bed" | "doctor" | "test";
  severity: "critical" | "warning" | "watch";
  facilityName: string;
  itemName?: string;
  daysToZero?: number | null;
  currentQty?: number;
  occupied?: number;
  total?: number;
  testName?: string;
}

export interface FlagExplanationResult {
  en: string | null;
  hi: string | null;
}

export async function generateFlagExplanation(
  input: FlagExplanationInput
): Promise<FlagExplanationResult> {
  const ctx = buildExplanationContext(input);
  const prompt: LLMMessage[] = [
    {
      role: "system",
      content:
        "You are a concise bilingual (English + Hindi) operations assistant for a district health officer. " +
        "Given structured numbers about a flagged facility, output EXACTLY two lines: one English sentence (prefix 'EN: ') and one Hindi sentence (prefix 'HI: '), each under 25 words. " +
        "Be plain-language and actionable. Use the numbers given, do not invent facility names or extra metrics.",
    },
    { role: "user", content: ctx },
  ];

  const { text } = await complete(prompt, { temperature: 0.2, maxTokens: 160 });
  if (!text) return { en: null, hi: null };

  const enMatch = text.match(/EN:\s*(.+)/i);
  const hiMatch = text.match(/HI:\s*(.+)/i);
  return {
    en: enMatch ? enMatch[1].trim().split(/\n/)[0].trim() : null,
    hi: hiMatch ? hiMatch[1].trim().split(/\n/)[0].trim() : null,
  };
}

function buildExplanationContext(i: FlagExplanationInput): string {
  const severityWord =
    i.severity === "critical"
      ? "CRITICAL"
      : i.severity === "warning"
      ? "WARNING"
      : "WATCH";
  const base = `Facility: ${i.facilityName}. Severity: ${severityWord}.`;
  let detail = "";
  if (i.category === "stock") {
    detail = `Item: ${i.itemName ?? "a medicine"}. Current stock: ${i.currentQty ?? "?"} units. Projected stock-out in ${i.daysToZero?.toFixed(1) ?? "?"} days at the current 14-day consumption rate.`;
  } else if (i.category === "bed") {
    detail = `Beds: ${i.occupied ?? "?"} occupied of ${i.total ?? "?"} total — fully occupied / near capacity.`;
  } else if (i.category === "doctor") {
    detail = `No doctor has checked in past today's cutoff time (no prior notice recorded).`;
  } else if (i.category === "test") {
    detail = `Test / equipment '${i.testName ?? "a test"}' is currently non-functional.`;
  }
  return `${base}\n${detail}\n\nRespond with:\nEN: <one English sentence>\nHI: <one Hindi sentence>`;
}

// Best-effort: write explanation back to the flag row. Isolated — if the LLM
// call or the write fails, the flag row (with its raw severity) remains intact
// and the dashboard shows the raw number instead of a blank space (Phase 10).
export async function explainAndStoreFlag(
  input: FlagExplanationInput
): Promise<void> {
  const { en, hi } = await generateFlagExplanation(input);
  if (!en && !hi) return;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("flags")
    .update({ reason_text_en: en, reason_text_hi: hi })
    .eq("id", input.flagId);
  if (error) console.error("flag explanation store failed", error);
}

// ---------------------------------------------------------------------------
// (parseIntent and chatbotAnswer were removed in favor of lib/ai/agent.ts)
// ---------------------------------------------------------------------------
