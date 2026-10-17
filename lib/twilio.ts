import crypto from "crypto";

// ---------------------------------------------------------------------------
// Twilio request-signature verification (webhook authenticity).
//
// Twilio signs every webhook it sends with the account's auth token. The
// signature is HMAC-SHA1 over the full request URL followed by each POST
// parameter (sorted by key, key and value concatenated), base64-encoded, and
// delivered in the `X-Twilio-Signature` header. Verifying it is the only way
// to prove a webhook actually came from Twilio and was not spoofed by an
// attacker POSTing to the public endpoint.
// See: https://www.twilio.com/docs/usage/security#validating-requests
// ---------------------------------------------------------------------------

// Compute the expected signature for a URL + form params.
function computeSignature(
  authToken: string,
  url: string,
  params: Record<string, string>
): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

// Constant-time comparison that tolerates unequal-length inputs (timingSafeEqual
// throws if the buffers differ in length).
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Validate an incoming Twilio webhook. Returns true only when the signature
// header matches. When TWILIO_AUTH_TOKEN is unset we FAIL CLOSED (reject),
// because an unauthenticated webhook is exactly the spoofing hole we're
// closing — the endpoint must not accept traffic it cannot verify.
export function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error(
      "TWILIO_AUTH_TOKEN not set — rejecting webhook (cannot verify authenticity)"
    );
    return false;
  }
  if (!signature) return false;
  const expected = computeSignature(authToken, url, params);
  return safeEqual(expected, signature);
}

// The public URL Twilio signed against. Behind a proxy (Vercel), the incoming
// request URL may be http/internal; Twilio signs the externally-visible URL,
// so we reconstruct it from forwarded headers when present.
export function externalRequestUrl(req: Request): string {
  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (forwardedHost) {
    return `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost}${url.pathname}${url.search}`;
  }
  return req.url;
}

// XML-escape a string for safe embedding in a TwiML response. Escapes all five
// XML predefined entities (&, <, >, ", ') so malformed markup can never break
// the response document.
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
