"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { Language } from "@/lib/i18n/dictionaries";

export default function LangToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="flex items-center gap-1 rounded-full bg-ms-border/50 p-1 text-xs font-medium"
    >
      <button
        type="button"
        role="radio"
        aria-checked={language === "en"}
        aria-label="English"
        onClick={() => setLanguage("en")}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          language === "en"
            ? "bg-ms-surface text-ms-textPrimary shadow-sm"
            : "text-ms-textSecondary hover:text-ms-textPrimary"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={language === "hi"}
        aria-label="हिन्दी"
        onClick={() => setLanguage("hi")}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          language === "hi"
            ? "bg-ms-surface text-ms-textPrimary shadow-sm"
            : "text-ms-textSecondary hover:text-ms-textPrimary"
        }`}
      >
        HI
      </button>
    </div>
  );
}
