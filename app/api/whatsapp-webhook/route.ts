import { NextResponse } from "next/server";
import { processMessagePipeline } from "@/lib/ats/pipeline";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateTwilioSignature, externalRequestUrl, escapeXml } from "@/lib/twilio";

// WhatsApp webhook (Twilio incoming)
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    // 1. Verify this POST actually came from Twilio (signed with our auth
    //    token). Without this the endpoint is spoofable by anyone.
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });
    const signature = req.headers.get("x-twilio-signature");
    if (!validateTwilioSignature(externalRequestUrl(req), params, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const body = params.Body || "";
    const from = params.From || ""; // Format: "whatsapp:+919876543210"

    if (!body || !from) {
      return NextResponse.json({ error: "Missing Body or From" }, { status: 400 });
    }

    // Rate Limiting (10 req / minute per phone number)
    const { allowed } = await checkRateLimit({
      ipOrPhone: from,
      maxRequests: 10,
      windowMinutes: 1
    });

    if (!allowed) {
      return new NextResponse(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>Too many requests, please try again in a minute.</Message></Response>",
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    // Use hashed or truncated phone number as session key to avoid PII in chat_logs
    const sessionKey = from.replace("whatsapp:", "").slice(-4) + "_wa_session";

    const result = await processMessagePipeline(body, "whatsapp", sessionKey);

    // Twilio TwiML response
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(result.response)}</Message>
</Response>`;

    return new NextResponse(xml, { headers: { "Content-Type": "text/xml" } });

  } catch (err) {
    console.error("WhatsApp webhook error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
