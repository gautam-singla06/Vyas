import { createServiceClient } from "@/lib/supabase/server";
import { detectEmergency } from "./emergency";
import { runAtsRouter } from "./router";
import { runAgent } from "@/lib/ai/agent";

export interface PipelineResult {
  response: string;
}

export async function processMessagePipeline(
  message: string, 
  channel: "web" | "whatsapp" | "sms", 
  patientSession: string,
  facilityId?: string,
  options: { allowStockIntent?: boolean } = {}
): Promise<PipelineResult> {
  const language = containsHindi(message) ? "hi" : "en";
  const supabase = createServiceClient();
  let finalResponse = "";
  let handledBy = "gemini";
  let matchedPattern = null;
  let isEmergency = false;

  // 1. Emergency Detection (Short-circuit)
  const emergencyMatch = detectEmergency(message);
  if (emergencyMatch) {
    finalResponse = emergencyMatch;
    handledBy = "ats";
    matchedPattern = "emergency_keyword";
    isEmergency = true;
  } else {
    // 2. ATS Engine
    const atsMatch = await runAtsRouter(message, language);
    if (atsMatch) {
      finalResponse = atsMatch.response;
      handledBy = "ats";
      matchedPattern = atsMatch.pattern;
    } else {
      // 3. Gemini Tool-Calling Agent Fallback
      finalResponse = await runAgent({
        query: message,
        language,
        patientSession,
        facilityId,
        allowStockIntent: options.allowStockIntent === true,
      });
    }
  }

  // 4. Log to chat_logs
  try {
    await supabase.from("chat_logs").insert({
      facility_id: facilityId ?? null,
      patient_session: patientSession,
      language,
      message,
      response: finalResponse,
      handled_by: handledBy,
      channel,
      matched_pattern: matchedPattern,
      is_emergency: isEmergency
    });
  } catch (err) {
    console.error("Pipeline chat_logs insert failed", err);
  }

  return { response: finalResponse };
}

function containsHindi(text: string): boolean {
  // Simple heuristic for Devangari or common transliterated words
  if (/[\u0900-\u097F]/.test(text)) return true;
  const words = text.toLowerCase().split(/\s+/);
  const hindiKeywords = ["hai", "kya", "mein", "nahi", "raha", "gaya", "namaste", "dhanyavad"];
  return words.some(w => hindiKeywords.includes(w));
}
