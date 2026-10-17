"use server";

import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { getFacilityAvailability } from "./queries";
import { processMessagePipeline } from "@/lib/ats/pipeline";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";


// Patient chatbot responder — invoked from the public page. No auth. The
// patient's anonymous session token is generated client-side and logged here
// against chat_logs.patient_session (no identity).

export async function askChatbot(
  input: { query: string; language: "en" | "hi"; facilityId?: string; patientSession: string }
): Promise<{ answer: string | null; grounded: boolean }> {
  
  // Rate Limiting (20 req / minute per IP for public web chat).
  // headers() is async in Next.js 16 — must be awaited or the IP is always
  // "unknown-ip" (every request shares one bucket, defeating the limiter).
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") || "unknown-ip";
  const { allowed } = await checkRateLimit({
    ipOrPhone: ip,
    maxRequests: 20,
    windowMinutes: 1
  });

  if (!allowed) {
    return { 
      answer: input.language === "hi" 
        ? "बहुत सारे अनुरोध। कृपया एक मिनट में पुनः प्रयास करें।" 
        : "Too many requests, please try again in a minute.", 
      grounded: true 
    };
  }

  // Pipeline handles Emergency, ATS, Gemini agent and logging to chat_logs
  // Note: we removed the old rigid grounding to just use the agent's tools,
  // but we pass the facilityId down for contextual grounding.
  const result = await processMessagePipeline(input.query, "web", input.patientSession, input.facilityId);

  return { answer: result.response, grounded: true };
}
