"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function FooterSection() {
  const { t } = useLanguage();
  return (
    <footer className="bg-ms-surface border-t border-ms-border pt-16 pb-8">
      <div className="max-w-content mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          
          {/* Brand & Description */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-ms-sm bg-brand text-white">
                <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  <path d="M12 12v4M12 8v2M9 12h6" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight text-ms-textPrimary">
                {t.login_title}
              </span>
            </div>
            <p className="text-sm text-ms-textSecondary leading-relaxed pr-4">
              {t.footer_desc}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-ms-textPrimary mb-6">{t.footer_quick_links}</h4>
            <ul className="space-y-4">
              <li><Link href="/" className="text-sm text-ms-textSecondary hover:text-brand transition-colors">{t.nav_home}</Link></li>
              <li><Link href="/#features" className="text-sm text-ms-textSecondary hover:text-brand transition-colors">{t.nav_features}</Link></li>
              <li><Link href="/#how-it-works" className="text-sm text-ms-textSecondary hover:text-brand transition-colors">{t.nav_how_it_works}</Link></li>
              <li><Link href="/#who-uses" className="text-sm text-ms-textSecondary hover:text-brand transition-colors">{t.nav_who_uses}</Link></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-bold text-ms-textPrimary mb-6">{t.footer_resources}</h4>
            <ul className="space-y-4">
              <li><Link href="/privacy" className="text-sm text-ms-textSecondary hover:text-brand transition-colors">{t.footer_privacy}</Link></li>
              <li><Link href="/terms" className="text-sm text-ms-textSecondary hover:text-brand transition-colors">{t.footer_terms}</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-ms-textPrimary mb-6">{t.footer_contact}</h4>
            <ul className="space-y-4">
              <li>
                <a href="mailto:work.vyas@gmail.com" className="flex items-center gap-2 text-sm text-ms-textSecondary hover:text-brand transition-colors">
                  <Mail className="w-4 h-4" />
                  work.vyas@gmail.com
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-ms-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-ms-textDisabled">
            {t.footer_rights}
          </p>
          <p className="text-sm font-medium text-brand">
            {t.footer_built}
          </p>
        </div>
      </div>
    </footer>
  );
}

