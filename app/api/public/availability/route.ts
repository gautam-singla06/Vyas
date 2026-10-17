import { NextResponse } from "next/server";
import { getFacilityAvailability } from "@/domain/patient-access/queries";
import { checkRateLimit } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Anon-friendly availability fetch for the patient lookup's on-selection
// re-query. Reuses the same read paths as the RLS-granted public reads; no
// auth check anywhere.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { facilityId?: string };
  if (!body.facilityId || !UUID.test(body.facilityId)) {
    return NextResponse.json({ error: "facilityId required" }, { status: 400 });
  }
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown-ip";
  const { allowed } = await checkRateLimit({ ipOrPhone: ip, maxRequests: 30, windowMinutes: 1 });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const availability = await getFacilityAvailability(body.facilityId);
  return NextResponse.json(availability);
}
