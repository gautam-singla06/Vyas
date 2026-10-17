"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import LangToggle from "@/components/LangToggle";
import ThemeToggle from "@/components/ThemeToggle";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function AvailabilityHeader() {
  const { language, t } = useLanguage();
  const pathname = usePathname();
  const [pillCompact, setPillCompact] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setPillCompact(y > lastScrollY.current && y > 60);
      lastScrollY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isAvailabilityHome = pathname === "/availability";
  const isAvailabilitySubpage = pathname?.startsWith("/availability/") && !isAvailabilityHome;
  const showBack = isAvailabilityHome || isAvailabilitySubpage;
  
  const backHref = isAvailabilityHome ? "/" : "/availability";
  const backText = isAvailabilityHome ? (language === 'hi' ? 'होम' : 'Home') : (t.back_to_categories || "Back");

  return (
    <header className="fixed top-0 left-0 right-0 w-full z-40 flex justify-center px-4 pt-3 pb-2 pointer-events-none">
      <div className="w-full max-w-5xl relative flex justify-center items-center">
        {showBack && (
          <div className="absolute left-0 pointer-events-auto hidden sm:block">
            <Link href={backHref} className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-full bg-ms-surface border border-ms-border shadow-sm text-ms-textSecondary hover:text-brand transition-colors duration-200">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {backText}
            </Link>
          </div>
        )}

        <nav
          className={`
            pointer-events-auto ms-pill-nav flex items-center gap-2 rounded-full border border-ms-border
            bg-ms-surface shadow-card-lg transition-all duration-300 ease-in-out
            ${pillCompact ? "px-4 py-2" : "px-5 py-3"}
          `}
          aria-label="Patient lookup navigation"
        >
          <div className={`flex items-center gap-2 transition-all duration-300 ease-in-out ${pillCompact ? "gap-1.5" : ""}`}>
            <div className={`flex items-center justify-center transition-all duration-300 ease-in-out ${pillCompact ? "h-6 w-6" : "h-8 w-8"}`}>
              <Image
                src="/assets/vyas-logo.png"
                alt="Vyas Logo"
                width={32}
                height={32}
                className="object-contain w-full h-full"
              />
            </div>
            {!pillCompact && (
              <span className="hidden sm:inline text-sm font-semibold text-ms-textPrimary whitespace-nowrap overflow-hidden transition-all duration-300">Vyas</span>
            )}
          </div>

          <div className="mx-2 h-4 w-px bg-ms-border" aria-hidden="true" />
          <LangToggle />
          <div className="mx-1 h-4 w-px bg-ms-border" aria-hidden="true" />
          <ThemeToggle className="!border-transparent !px-2 !py-1" />

          {!pillCompact && (
            <span className="ml-1 hidden rounded-full border border-[#B8E2CA] bg-watch-tint px-2.5 py-1 text-xs font-medium text-watch md:inline-flex whitespace-nowrap overflow-hidden transition-all duration-300" data-no-invert>
              {t.no_login_needed}
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
