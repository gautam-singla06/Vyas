import { createServiceClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// ATS Engine: Rule-Based Conversation Router
// Sits in front of all text channels (Web, WhatsApp, SMS, Voice).
// Fast, deterministic, zero-AI-credits. Escalate to Gemini if no match.
// ---------------------------------------------------------------------------

const GREETINGS = ["hi", "hello", "namaste", "hii", "hey", "hola"];
const CLOSINGS = ["thanks", "thank you", "dhanyavad", "bye", "goodbye"];

const GREETING_RESPONSE = {
  en: "Hello! I am the Vyas assistant. How can I help you today? You can ask about medicines, beds, or tests.",
  hi: "नमस्ते! मैं Vyas सहायक हूँ। मैं आपकी कैसे मदद कर सकता हूँ? आप दवाओं, बिस्तरों, या टेस्ट के बारे में पूछ सकते हैं।"
};

const CLOSING_RESPONSE = {
  en: "You're welcome! Stay healthy.",
  hi: "आपका स्वागत है! स्वस्थ रहें।"
};

export interface ATSMatch {
  response: string;
  pattern: string; // for logging
}

export async function runAtsRouter(message: string, language: "en" | "hi"): Promise<ATSMatch | null> {
  const text = message.trim().toLowerCase();

  // 1. GREETINGS & CLOSINGS
  if (GREETINGS.includes(text)) {
    return { response: GREETING_RESPONSE[language], pattern: "greeting" };
  }
  if (CLOSINGS.includes(text)) {
    return { response: CLOSING_RESPONSE[language], pattern: "closing" };
  }

  // 2. Structured stock writes are deliberately not accepted here. This router
  // is reached by anonymous web and messaging traffic; updates must go through
  // authenticated, facility-scoped server actions.
  // Format: "STOCK <ITEM> <QTY>" (Delta is absolute for our app, or signed).
  // e.g. "STOCK Paracetamol 50" or "STOCK Paracetamol 0"
  // Since ATS doesn't know the facility from the message (it comes from the sender), 
  // wait, the prompt says "STOCK <ITEM> <DELTA> <FACILITY>".
  // Let's implement a strict regex for this.
  // 3. STRUCTURED AVAILABILITY QUERY
  // e.g., "Paracetamol hai kya" or "is Paracetamol available at Rampur"
  const availabilityMatch = text.match(/(.+?)\s+(?:hai kya|is available|available at)\s*(.+)?/i) || 
                            text.match(/is\s+(.+?)\s+available(?: at\s+(.+))?/i);
  
  if (availabilityMatch && availabilityMatch[1]) {
    let itemName = availabilityMatch[1].trim();
    let facilityName = availabilityMatch[2]?.trim();

    // Fix parsing if it caught trailing words
    if (itemName.endsWith("hai kya")) itemName = itemName.replace(/hai kya$/i, "").trim();
    
    // Try to fuzzy match the DB
    if (itemName.length > 2) {
       const result = await checkAvailabilityDeterministic(itemName, facilityName, language);
       if (result) {
         return { response: result, pattern: "availability_query" };
       }
    }
  }

  // 4. NO MATCH -> Escalate to Gemini
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function checkAvailabilityDeterministic(itemName: string, facilityName: string | undefined, language: "en" | "hi"): Promise<string | null> {
  const supabase = createServiceClient();
  
  // 1. Fetch facilities
  const { data: facilities } = await supabase.from("facilities").select("id, name");
  if (!facilities) return null;

  let targetFacilityId = null;
  let targetFacilityName = "";

  if (facilityName) {
    const matched = fuzzyMatch(facilityName, facilities, "name");
    // If ambiguous or no match, fall back to AI
    if (matched.length !== 1) return null;
    targetFacilityId = matched[0].id;
    targetFacilityName = matched[0].name;
  }

  // 2. Fetch stock items (only for the matched facility, or all if none)
  let stockQuery = supabase.from("stock_items").select("item_name, quantity, facility_id");
  if (targetFacilityId) {
    stockQuery = stockQuery.eq("facility_id", targetFacilityId);
  }
  
  const { data: stockItems } = await stockQuery;
  if (!stockItems) return null;

  const matchedStock = fuzzyMatch(itemName, stockItems, "item_name");
  
  if (matchedStock.length === 0) {
    // maybe it's a test?
    let testQuery = supabase.from("test_availability").select("test_name, is_functional, facility_id");
    if (targetFacilityId) testQuery = testQuery.eq("facility_id", targetFacilityId);
    const { data: tests } = await testQuery;
    if (tests) {
      const matchedTest = fuzzyMatch(itemName, tests, "test_name");
      if (matchedTest.length === 1) {
        const t = matchedTest[0];
        const f = targetFacilityId ? targetFacilityName : facilities.find(f => f.id === t.facility_id)?.name;
        if (language === "hi") {
          return `${t.test_name} ${f ? f + " में " : ""}${t.is_functional ? "उपलब्ध है।" : "उपलब्ध नहीं है।"}`;
        }
        return `Yes, ${t.test_name} is ${t.is_functional ? "functional" : "not functional"}${f ? " at " + f : ""}.`;
      }
    }
    return null;
  }

  // If we matched exactly one stock item across the scope
  if (matchedStock.length === 1) {
    const s = matchedStock[0];
    const fName = targetFacilityId ? targetFacilityName : facilities.find(f => f.id === s.facility_id)?.name;
    
    if (language === "hi") {
      return `हाँ, ${s.item_name} ${fName ? fName + " में " : ""}उपलब्ध है। मात्रा: ${s.quantity}`;
    }
        return `Yes, ${s.item_name} is ${s.quantity > 0 ? "available" : "not currently available"}${fName ? " at " + fName : ""}.`;
  }

  return null; // Ambiguous or multi-match -> Escalate to AI
}

async function handleStructuredStockUpdate(itemName: string, qty: number, facilityRaw?: string): Promise<{response: string} | null> {
  const supabase = createServiceClient();
  
  // Find facility
  const { data: facilities } = await supabase.from("facilities").select("id, name");
  if (!facilities) return null;

  let facilityId = null;
  if (facilityRaw) {
    const matched = fuzzyMatch(facilityRaw, facilities, "name");
    if (matched.length !== 1) return null; // Ambiguous
    facilityId = matched[0].id;
  }

  // Find item. Read the current quantity too so we can record the true delta
  // (the change), not the new absolute quantity — stock_logs.delta drives the
  // consumption/restock forecast, so an absolute value here would corrupt it.
  let query = supabase.from("stock_items").select("id, item_name, quantity");
  if (facilityId) query = query.eq("facility_id", facilityId);

  const { data: items } = await query;
  if (!items) return null;

  const matchedItem = fuzzyMatch(itemName, items, "item_name");
  if (matchedItem.length !== 1) return null; // Ambiguous

  // We have exactly one item. ATS runs server-side and synchronously, so it
  // writes the new absolute quantity directly and appends the signed delta.
  const target = matchedItem[0] as { id: string; item_name: string; quantity: number };
  const targetId = target.id;
  const delta = qty - (target.quantity ?? 0);

  const { error: updateErr } = await supabase
    .from("stock_items")
    .update({ quantity: qty, updated_at: new Date().toISOString() })
    .eq("id", targetId);
  if (updateErr) return null;

  // Only append an audit row when the quantity actually changed. delta is the
  // signed change (negative = consumption, positive = restock).
  if (delta !== 0) {
    await supabase.from("stock_logs").insert({
      stock_item_id: targetId,
      delta,
      source: "sms",
    });
  }

  return { response: `✅ Stock updated: ${target.item_name} is now ${qty}.` };
}

// Very simple substring / exact match (no heavy NLP)
function fuzzyMatch<T>(query: string, items: T[], key: keyof T): T[] {
  const q = query.toLowerCase().trim();
  const exact = items.filter(i => String(i[key]).toLowerCase() === q);
  if (exact.length > 0) return exact;

  const partial = items.filter(i => {
    const val = String(i[key]).toLowerCase();
    return val.includes(q) || q.includes(val);
  });
  return partial;
}
