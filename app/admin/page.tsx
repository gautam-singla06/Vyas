import { getCurrentStaff } from "@/lib/auth/context";
import {
  getDistrictFlags,
  getDistrictFacilities,
  getDistrictSuggestions,
} from "@/domain/admin/queries";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const staff = await getCurrentStaff();
  if (!staff) return null; // layout shows the not-registered notice
  if (staff.role !== "admin") return null; // layout shows the role-mismatch notice

  // Pass the already-resolved staff context into each query so they don't each
  // re-run getCurrentStaff (4× auth + staff reads for one page load).
  const [flags, facilities, suggestions] = await Promise.all([
    getDistrictFlags(staff),
    getDistrictFacilities(staff),
    getDistrictSuggestions(staff),
  ]);

  // Only unresolved flags appear on the live dashboard — the runner escalates
  // resolved→re-raised automatically, so already-resolved ones don't clutter.
  const unresolved = flags.filter((f) => !f.resolved);

  return (
    <AdminDashboardClient
      initialFlags={unresolved}
      initialFacilities={facilities}
      initialSuggestions={suggestions}
    />
  );
}
