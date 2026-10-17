"use client";

import dynamic from "next/dynamic";
import LangToggle from "@/components/LangToggle";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import FlagsList from "./FlagsList";
import type { FacilityMarker, FlagRow, SuggestionRow } from "@/domain/admin/queries";

interface Props {
  initialFlags: FlagRow[];
  initialFacilities: FacilityMarker[];
  initialSuggestions: SuggestionRow[];
}

const FacilitiesMap = dynamic(() => import("./FacilitiesMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[380px] w-full animate-pulse rounded-ms-md border border-ms-border bg-ms-surface2" />
  ),
});

export default function AdminDashboardClient({
  initialFlags,
  initialFacilities,
  initialSuggestions,
}: Props) {
  const { language, t } = useLanguage();

  const criticalCount = initialFlags.filter(f => f.severity === "critical").length;
  const warningCount  = initialFlags.filter(f => f.severity === "warning").length;
  const watchCount    = initialFlags.filter(f => f.severity === "watch").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-admin-xl font-extrabold tracking-tight text-ms-textPrimary">
            {t.admin_dashboard}
          </h1>
          <p className="mt-1 text-admin-sm text-ms-textSecondary">{t.live_alerts} · {t.redistribution}</p>
        </div>

        <div className="flex items-center gap-2">
          <LangToggle />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <SummaryCard value={criticalCount} label={t.severity_critical} color="critical" />
        <SummaryCard value={warningCount}  label={t.severity_warning}  color="warning" />
        <SummaryCard value={watchCount}    label={t.severity_watch}    color="watch" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <FlagsList
            initialFlags={initialFlags}
            initialSuggestions={initialSuggestions}
          />
        </div>
        <div>
          <h2 className="mb-3 text-admin-md font-semibold text-ms-textPrimary">{t.facilities_map}</h2>
          <div className="h-[380px] overflow-hidden rounded-ms-md border border-ms-border shadow-card">
            <FacilitiesMap facilities={initialFacilities} suggestions={initialSuggestions} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  value, label, color,
}: {
  value: number;
  label: string;
  color: "critical" | "warning" | "watch";
}) {
  const styles = {
    critical: "bg-critical-tint border-[#EDB3B3] text-critical",
    warning:  "bg-warning-tint  border-[#E8C97A]  text-warning",
    watch:    "bg-watch-tint    border-[#B8E2CA]  text-watch",
  };
  const icons = {
    critical: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7.25-3.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100 1.5.75.75 0 000-1.5z" clipRule="evenodd"/>
      </svg>
    ),
    warning: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
      </svg>
    ),
    watch: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-5 w-5" aria-hidden="true">
        <path fillRule="evenodd" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm7.25-3.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100 1.5.75.75 0 000-1.5z" clipRule="evenodd"/>
      </svg>
    ),
  };
  return (
    <div data-no-invert className={`rounded-ms-md border p-4 ${styles[color]}`}>
      <div className="flex items-center gap-2">
        {icons[color]}
        <span className="text-admin-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
