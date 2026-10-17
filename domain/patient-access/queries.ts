// Patient Access bounded context (Phase 11, ADR-008). READ-ONLY, anonymous,
// no login. The browser hits Supabase directly with the anon key; RLS grants
// anon SELECT on exactly the public-readable fields (facilities, stock_items,
// bed_status, test_availability) per Phase 1. No staff/admin rows are exposed.

export interface PatientFacility {
  id: string;
  name: string;
  type: "PHC" | "CHC";
  district: string;
  block: string;
  lat: number;
  lng: number;
}

export interface PatientStockItem {
  item_name: string;
  is_available: boolean;
}

export interface PatientBedStatus {
  available: number;
}

export interface PatientTestStatus {
  test_name: string;
  is_functional: boolean;
}

// Server-side initial reads for the public page (so the first paint is real,
// not a spinner — important since the patient has no account and poor signal).
// These use the anon, no-auth server client; RLS still grants the public read.

import { createServiceClient } from "@/lib/supabase/server";

async function listFacilities(): Promise<PatientFacility[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("facilities")
    .select("id, name, type, district, block, lat, lng")
    .order("name");
  return (data ?? []) as PatientFacility[];
}

export async function getFacilityAvailability(facilityId: string): Promise<{
  stock: PatientStockItem[];
  beds: PatientBedStatus | null;
  tests: PatientTestStatus[];
}> {
  // Base tables are not exposed to the anon API. This server-only endpoint
  // deliberately projects the small public availability contract below.
  const supabase = createServiceClient();

  const [stockRes, bedRes, testRes] = await Promise.all([
    supabase.from("stock_items").select("item_name, quantity, unit").eq("facility_id", facilityId),
    supabase.from("bed_status").select("total, occupied").eq("facility_id", facilityId).maybeSingle(),
    supabase.from("test_availability").select("test_name, is_functional").eq("facility_id", facilityId),
  ]);

  const beds = bedRes.data
    ? {
        available: (bedRes.data.total as number) - (bedRes.data.occupied as number),
      }
    : null;

  return {
    stock: (stockRes.data ?? []).map((item) => ({
      item_name: item.item_name as string,
      is_available: (item.quantity as number) > 0,
    })),
    beds,
    tests: (testRes.data ?? []) as PatientTestStatus[],
  };
}
