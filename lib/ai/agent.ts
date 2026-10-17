import { createServiceClient } from "@/lib/supabase/server";
import { complete, type LLMMessage } from "./gemini";
import { EMERGENCY_CANNED_RESPONSES } from "@/lib/ats/emergency";

// ---------------------------------------------------------------------------
// Gemini Tool-Calling Agent (Fallback for ATS Engine)
// Replaces the old rigid functions with a multi-turn tool loop.
// ---------------------------------------------------------------------------

export interface AgentInput {
  query: string;
  language: "en" | "hi";
  patientSession: string; // The session ID or phone number
  facilityId?: string; // Optional context if on a specific facility page
  allowStockIntent?: boolean;
}

const MAX_ITERATIONS = 5;

// Define tools available to Gemini
const PUBLIC_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_stock",
      description: "Check whether a medicine/item is available at a specific facility.",
      parameters: {
        type: "object",
        properties: {
          itemName: { type: "string" },
          facilityName: { type: "string" },
        },
        required: ["itemName", "facilityName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_bed_availability",
      description: "Check available beds at a facility.",
      parameters: {
        type: "object",
        properties: {
          facilityName: { type: "string" },
        },
        required: ["facilityName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_test_availability",
      description: "Check if a diagnostic test is functional at a facility.",
      parameters: {
        type: "object",
        properties: {
          testName: { type: "string" },
          facilityName: { type: "string" },
        },
        required: ["testName", "facilityName"],
      },
    },
  },
];

const EMERGENCY_TOOL = {
  type: "function" as const,
  function: {
    name: "get_emergency_guidance",
    description: "Get the pre-approved first-aid response for emergency situations. Use this if the user is in distress.",
    parameters: {
      type: "object",
      properties: { symptom: { type: "string" } },
      required: ["symptom"],
    },
  },
};

const STOCK_INTENT_TOOL = {
  type: "function" as const,
  function: {
    name: "parse_stock_update",
    description: "Parse a staff user's stock-update request into structured JSON for confirmation. This tool never performs a write.",
    parameters: {
      type: "object",
      properties: {
        transcript: { type: "string" },
      },
      required: ["transcript"],
    },
  },
};

export async function runAgent(input: AgentInput): Promise<string> {
  const supabase = createServiceClient();
  const langInstruction = input.language === "hi" ? "Respond in Hindi." : "Respond in English.";

  // 1. Fetch multi-turn context (last 5 messages from this session, within last 30 minutes)
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: history } = await supabase
    .from("chat_logs")
    .select("message, response")
    .eq("patient_session", input.patientSession)
    .gt("created_at", thirtyMinsAgo)
    .order("created_at", { ascending: false })
    .limit(5);

  const messages: LLMMessage[] = [
    {
      role: "system",
      content:
        "You are a patient-facing assistant for a district health system. " +
        "Answer ONLY from tool results. Do NOT invent facility names or quantities. " +
        "If you don't know, say so. Keep answers under 30 words. " +
        langInstruction,
    },
  ];

  if (history && history.length > 0) {
    history.reverse().forEach((log) => {
      messages.push({ role: "user", content: log.message });
      if (log.response) {
         messages.push({ role: "assistant", content: log.response });
      }
    });
  }

  messages.push({ role: "user", content: input.query });

  // 2. Tool-Calling Loop
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { text, tool_calls } = await complete(messages, {
      maxTokens: 300,
      temperature: 0.1,
      tools: input.allowStockIntent
        ? [...PUBLIC_TOOLS, EMERGENCY_TOOL, STOCK_INTENT_TOOL]
        : [...PUBLIC_TOOLS, EMERGENCY_TOOL],
    });

    if (tool_calls && tool_calls.length > 0) {
      // Add the assistant's tool call message
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: tool_calls,
      });

      // Execute each tool and append results
      for (const call of tool_calls) {
        const result = await executeTool(call.function.name, call.function.arguments, input.language);
        messages.push({
          role: "tool",
          name: call.function.name,
          content: result,
          tool_call_id: call.id, // For strictly compliant OpenAI/OpenRouter arrays
        });
      }
    } else if (text) {
      return text;
    } else {
      return input.language === "hi" 
        ? "क्षमा करें, मुझे समझने में समस्या हो रही है।" 
        : "Sorry, I am having trouble understanding right now.";
    }
  }

  return input.language === "hi" 
    ? "माफ़ करें, मुझे उत्तर खोजने में बहुत समय लग रहा है।" 
    : "Sorry, it's taking me too long to find the answer.";
}

// Escape LIKE/ILIKE wildcards in user- (LLM-) supplied input so a value like
// "%" can't match every row. `\` is the default PostgREST escape char.
function escapeLike(s: unknown): string {
  return String(s ?? "").replace(/([\\%_])/g, "\\$1");
}

async function executeTool(name: string, argsString: string, lang: "en" | "hi"): Promise<string> {
  const supabase = createServiceClient();
  let args: any;
  try {
    args = JSON.parse(argsString);
  } catch {
    return "Error: Invalid tool arguments.";
  }

  switch (name) {
    case "search_stock": {
      const { data: f } = await supabase.from("facilities").select("id").ilike("name", `%${escapeLike(args.facilityName)}%`).maybeSingle();
      if (!f) return `Facility ${args.facilityName} not found.`;
      const { data: stock } = await supabase.from("stock_items").select("quantity, unit").eq("facility_id", f.id).ilike("item_name", `%${escapeLike(args.itemName)}%`).maybeSingle();
      if (!stock) return `Item ${args.itemName} not found at ${args.facilityName}.`;
      return `${args.itemName} is ${stock.quantity > 0 ? "available" : "not available"}.`;
    }

    case "check_bed_availability": {
      const { data: f } = await supabase.from("facilities").select("id").ilike("name", `%${escapeLike(args.facilityName)}%`).maybeSingle();
      if (!f) return `Facility ${args.facilityName} not found.`;
      const { data: beds } = await supabase.from("bed_status").select("total, occupied").eq("facility_id", f.id).maybeSingle();
      if (!beds) return "No bed data.";
      return `Beds are ${beds.total - beds.occupied > 0 ? "available" : "not currently available"}.`;
    }

    case "check_test_availability": {
      const { data: f } = await supabase.from("facilities").select("id").ilike("name", `%${escapeLike(args.facilityName)}%`).maybeSingle();
      if (!f) return `Facility not found.`;
      const { data: test } = await supabase.from("test_availability").select("is_functional").eq("facility_id", f.id).ilike("test_name", `%${escapeLike(args.testName)}%`).maybeSingle();
      if (!test) return "Test not found.";
      return `Test is ${test.is_functional ? "functional" : "not functional"}.`;
    }

    case "get_doctor_status": {
      const { data: f } = await supabase.from("facilities").select("id").ilike("name", `%${escapeLike(args.facilityName)}%`).maybeSingle();
      if (!f) return `Facility not found.`;
      
      const today = new Date().toISOString().split("T")[0];
      const { count: docs } = await supabase.from("doctor_attendance").select("id", { count: "exact" }).eq("facility_id", f.id).gte("check_in", today);
      const { data: footfall } = await supabase.from("footfall_logs").select("count").eq("facility_id", f.id).eq("date", today).maybeSingle();
      
      return `Doctors checked in today: ${docs ?? 0}. Total patients logged today: ${footfall?.count ?? 0}.`;
    }

    case "get_emergency_guidance": {
      // PROMPT 3 SAFETY RULE: Do NOT let the agent invent medical advice.
      // Must return exactly the canned response.
      return EMERGENCY_CANNED_RESPONSES[lang];
    }

    case "parse_stock_update": {
      // Parses voice/text intent for Phase 9 UI confirmation.
      // E.g., user says "paracetamol khatam"
      return `Return this JSON to the user for confirmation: {"action": "deplete_or_restock", "item": "...", "quantity": "..."}`;
    }

    default:
      return "Unknown tool.";
  }
}
