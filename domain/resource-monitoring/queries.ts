import { createServerClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/auth/context";

export interface StockItemRow {
  id: string;
  item_name: string;
  quantity: number;
  unit: string;
  updated_at: string;
}

export interface BedStatusRow {
  facility_id: string;
  total: number;
  occupied: number;
  available: number;
}

export interface TestRow {
  id: string;
  test_name: string;
  is_functional: boolean;
  updated_at: string;
}

export interface FootfallRow {
  date: string;
  count: number;
}

// All reads here are scoped implicitly by RLS to the caller's own facility —
// these queries never take a facilityId param from the client side; the staff
// context resolves it server-side.
export async function getMyStock(): Promise<StockItemRow[]> {
  const staff = await getCurrentStaff();
  if (!staff) return [];
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select("id, item_name, quantity, unit, updated_at")
    .eq("facility_id", staff.facilityId)
    .order("item_name");
  if (error) return [];
  return (data ?? []) as StockItemRow[];
}

export async function getMyBed(): Promise<BedStatusRow | null> {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("bed_status")
    .select("facility_id, total, occupied, updated_at")
    .eq("facility_id", staff.facilityId)
    .single();
  if (!data) return null;
  return {
    facility_id: data.facility_id as string,
    total: data.total as number,
    occupied: data.occupied as number,
    available: (data.total as number) - (data.occupied as number),
  };
}

export async function getMyTests(): Promise<TestRow[]> {
  const staff = await getCurrentStaff();
  if (!staff) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("test_availability")
    .select("id, test_name, is_functional, updated_at")
    .eq("facility_id", staff.facilityId)
    .order("test_name");
  return (data ?? []) as TestRow[];
}

export async function getTodayFootfall(): Promise<FootfallRow | null> {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("footfall_logs")
    .select("date, count")
    .eq("facility_id", staff.facilityId)
    .eq("date", today)
    .single();
  return data ? ({ date: data.date as string, count: data.count as number }) : null;
}
