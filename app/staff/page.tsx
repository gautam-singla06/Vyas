import { getCurrentStaff } from "@/lib/auth/context";
import {
  getMyStock,
  getMyBed,
  getMyTests,
  getTodayFootfall,
} from "@/domain/resource-monitoring/queries";
import StockSection from "@/components/staff/StockSection";
import BedSection from "@/components/staff/BedSection";
import TestSection from "@/components/staff/TestSection";
import FootfallSection from "@/components/staff/FootfallSection";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staff = await getCurrentStaff();
  if (!staff) return null; // layout shows the not-registered notice

  if (staff.role !== "nurse" && staff.role !== "pharmacist") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        The staff data-entry surface is for nurses/pharmacists. You are signed
        in as {staff.role}.
      </div>
    );
  }

  const [stock, bed, tests, footfall] = await Promise.all([
    getMyStock(),
    getMyBed(),
    getMyTests(),
    getTodayFootfall(),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <StockSection initial={stock} facilityId={staff.facilityId} />
      <FootfallSection initial={footfall} facilityId={staff.facilityId} />
      <BedSection initial={bed} facilityId={staff.facilityId} />
      <TestSection initial={tests} />
    </div>
  );
}
