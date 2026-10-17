import AvailabilityHeader from "@/components/public/AvailabilityHeader";

export default function AvailabilityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-h-dvh bg-ms-bg pt-20">
      <AvailabilityHeader />
      {children}
    </div>
  );
}
