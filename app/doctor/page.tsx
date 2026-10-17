import { getCurrentStaff } from "@/lib/auth/context";
import { getMyOpenAttendance } from "@/domain/workforce/actions";
import DoctorAttendanceClient from "@/components/doctor/DoctorAttendanceClient";

export const dynamic = "force-dynamic";

export default async function DoctorPage() {
  const staff = await getCurrentStaff();
  if (!staff) return null; // layout shows the not-registered notice

  if (staff.role !== "doctor") {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        The attendance screen is for doctors. You are signed in as {staff.role}.
      </div>
    );
  }

  const attendance = await getMyOpenAttendance();
  const open = attendance?.open ?? false;
  const checkIn = attendance?.checkIn;

  return (
    <DoctorAttendanceClient
      facilityId={staff.facilityId}
      initialOpen={open}
      initialCheckIn={checkIn}
    />
  );
}
