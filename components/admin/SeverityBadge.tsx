import type { FlagSeverityLike } from "@/lib/types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Color-coded severity badge — ALWAYS icon + text + color, never color alone.
export default function SeverityBadge({ severity }: { severity: FlagSeverityLike }) {
  const { t } = useLanguage();
  
  const cfg: Record<FlagSeverityLike, { bg: string; text: string; border: string; label: string; icon: React.ReactNode }> = {
    critical: {
      bg: "bg-critical-tint",
      text: "text-critical",
      border: "border-[#EDB3B3]",
      label: t.severity_critical,
      icon: (
        <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3" aria-hidden="true">
          <path fillRule="evenodd" d="M6 1a5 5 0 100 10A5 5 0 006 1zM5.25 3.5a.75.75 0 011.5 0v2.75a.75.75 0 01-1.5 0V3.5zm.75 5.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
        </svg>
      ),
    },
    warning: {
      bg: "bg-warning-tint",
      text: "text-warning",
      border: "border-[#E8C97A]",
      label: t.severity_warning,
      icon: (
        <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3" aria-hidden="true">
          <path fillRule="evenodd" d="M6.364 1.872c-.52-.901-1.808-.901-2.328 0L.28 8.375c-.52.9.13 2.025 1.164 2.025h9.111c1.035 0 1.684-1.124 1.164-2.025L6.364 1.872zM7 4a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0V4zm-.75 5.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
        </svg>
      ),
    },
    watch: {
      bg: "bg-watch-tint",
      text: "text-watch",
      border: "border-[#B8E2CA]",
      label: t.severity_watch,
      icon: (
        <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3" aria-hidden="true">
          <path fillRule="evenodd" d="M6 1a5 5 0 100 10A5 5 0 006 1zM5.25 3.5a.75.75 0 011.5 0v2.75a.75.75 0 01-1.5 0V3.5zm.75 5.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd"/>
        </svg>
      ),
    },
  };
  const c = cfg[severity] ?? cfg.watch;
  return (
    <span
      data-no-invert
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.bg} ${c.text} ${c.border}`}
      role="status"
      aria-label={`Severity: ${c.label}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}
