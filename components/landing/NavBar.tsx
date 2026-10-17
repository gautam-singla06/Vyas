"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import SignOutButton from "@/components/SignOutButton";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface NavBarProps {
  staff: { name: string; role: string } | null;
}

export default function NavBar({ staff }: NavBarProps) {
  const { t } = useLanguage();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-[#FFFFF0] dark:bg-ms-surface border-b border-ms-border shadow-md py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="mx-auto flex max-w-content items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/assets/vyas-logo.png"
            alt="Vyas Logo"
            width={0}
            height={0}
            sizes="100vw"
            className="h-[46px] w-auto opacity-100 transition-opacity duration-300 hover:opacity-80"
          />
          <span 
            className="text-xl font-bold tracking-tight text-brand hidden sm:block"
            style={{ fontFamily: 'var(--font-nunito)' }}
          >
            Vyas
          </span>
        </Link>

        {/* Center Menu (Desktop) */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/#features" className="text-sm font-semibold text-ms-textSecondary hover:text-brand transition-colors">{t.nav_features}</Link>
          <Link href="/#how-it-works" className="text-sm font-semibold text-ms-textSecondary hover:text-brand transition-colors">{t.nav_how_it_works}</Link>
          <Link href="/#who-uses" className="text-sm font-semibold text-ms-textSecondary hover:text-brand transition-colors">{t.nav_who_uses}</Link>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <LangToggle />
          </div>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>

          <Link
            href="/availability"
            className="hidden sm:flex rounded-full border border-brand/30 bg-brand/5 px-4 sm:px-5 py-2.5 text-sm font-semibold text-brand transition-all hover:bg-brand/10 hover:border-brand/50 active:scale-95"
          >
            Check Availability
          </Link>
          
          {staff ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-ms-textSecondary lg:block">
                {staff.name}
              </span>
              <SignOutButton className="rounded-full border border-ms-border px-4 py-2 text-sm font-semibold text-ms-textSecondary transition-colors hover:border-brand hover:text-brand" />
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-brand transition-all hover:bg-brand-hover active:scale-95"
            >
              {t.nav_staff_signin}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

