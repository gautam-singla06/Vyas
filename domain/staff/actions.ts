"use server";

import { processMessagePipeline } from "@/lib/ats/pipeline";
import { getCurrentStaff } from "@/lib/auth/context";
import { canUseVoiceStockIntent } from "@/lib/auth/authorization";

// Processes voice transcripts through the unified Emergency -> ATS -> Agent pipeline.
// Voice input is treated as a chat channel 'web' since it originates from the web app.
// The agent's 'parse_stock_update' tool is used to return structured intent for UI confirmation.
export async function processVoiceTranscript(
  transcript: string,
  sessionKey: string
): Promise<{ intent: any | null; responseText: string | null }> {
  const staff = await getCurrentStaff();
  if (!staff || !canUseVoiceStockIntent(staff.role)) {
    return { intent: null, responseText: "Not authorized" };
  }
  const result = await processMessagePipeline(transcript, "web", sessionKey, undefined, {
    allowStockIntent: true,
  });

  // The agent might return a structured intent string if it matched the parse_stock_update tool.
  // We check if it returned the expected JSON confirmation payload.
  try {
    const jsonMatch = result.response.match(/\{.*\}/s);
    if (jsonMatch) {
       const parsed = JSON.parse(jsonMatch[0]);
       if (parsed.action) {
         return { intent: parsed, responseText: null };
       }
    }
  } catch (err) {
    // Not JSON, just standard text response
  }

  return { intent: null, responseText: result.response };
}
