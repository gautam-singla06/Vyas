// Emergency keyword detection — short-circuits the pipeline before ATS or Gemini.
// Prompt 3: "This is NOT ambulance dispatch or GPS routing... This is keyword detection + a canned safety response."

const EMERGENCY_KEYWORDS = [
  // English
  "chest pain", "heart attack",
  "can't breathe", "cannot breathe", "shortness of breath", "choking",
  "seizure", "convulsion", "fits",
  "heavy bleeding", "bleeding heavily", "uncontrollable bleeding",
  "unconscious", "passed out", "fainted",
  "poison", "overdose",
  "severe burn",
  "stroke", "face drooping",
  // Hindi / Hinglish
  "seene mein dard", "dil ka daura",
  "saans nahi aa rahi", "saans lene mein dikkat",
  "daura", "mirgi",
  "bohot khoon", "khoon beh raha",
  "behosh", "hosh nahi",
  "zeher",
  "jal gaya", "bahut jal gaya",
  "lakwa"
];

// Pre-approved canned response
const CANNED_RESPONSE_EN = "🚨 EMERGENCY 🚨\nThis system is not for emergencies. Please call 108 immediately or go to the nearest hospital.\n\nThis is not a substitute for medical care — call 108 or go to the nearest facility immediately.";
const CANNED_RESPONSE_HI = "🚨 आपातकाल (EMERGENCY) 🚨\nयह सिस्टम आपातकाल के लिए नहीं है। कृपया तुरंत 108 पर कॉल करें या नजदीकी अस्पताल जाएं।\n\nयह चिकित्सा देखभाल का विकल्प नहीं है — तुरंत 108 पर कॉल करें या नजदीकी सुविधा में जाएं।";

export function detectEmergency(message: string): string | null {
  const text = message.toLowerCase();
  
  for (const keyword of EMERGENCY_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      // Determine language based on simple heuristic (if it contains Hindi keywords)
      const isHindi = text.includes("mein") || text.includes("nahi") || text.includes("raha") || text.includes("gaya");
      return isHindi ? CANNED_RESPONSE_HI : CANNED_RESPONSE_EN;
    }
  }
  
  return null;
}

// Exported so the Gemini agent can use the EXACT same pre-approved text
// rather than generating its own medical advice.
export const EMERGENCY_CANNED_RESPONSES = {
  en: CANNED_RESPONSE_EN,
  hi: CANNED_RESPONSE_HI
};
