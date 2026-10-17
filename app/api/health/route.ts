import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth/context";

export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff || staff.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Do not disclose integration configuration or probe privileged services.
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
