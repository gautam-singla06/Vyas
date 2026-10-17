"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient as createBrowserSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import LangToggle from "@/components/LangToggle";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Eye, EyeOff, Phone, ShieldCheck, ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";

let supabaseSingleton: SupabaseClient | null = null;
const getClient = () => {
  if (!supabaseSingleton) supabaseSingleton = createBrowserSupabase();
  return supabaseSingleton;
};

type TabType = "staff" | "admin";
type StaffStep = "phone" | "otp" | "not_registered";

export default function LoginClient() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const errorParam = searchParams.get("error");

  const [activeTab, setActiveTab] = useState<TabType>("staff");
  const [staffStep, setStaffStep] = useState<StaffStep>("phone");
  
  // Staff Phone / OTP state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);

  // Admin Email / Password state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Common UI states
  const [message, setMessage] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);

  const otpInputRef = useRef<HTMLInputElement>(null);

  // Check configuration on mount
  useEffect(() => {
    setConfigured(isSupabaseConfigured());
    if (errorParam === "unconfigured") {
      setErrored(true);
      setMessage(
        language === "hi"
          ? "सुपाबेस कॉन्फ़िगर नहीं है। कृपया .env.local में क्रेडेंशियल सेट करें।"
          : "Supabase is not configured. Please set credentials in .env.local."
      );
    }
  }, [errorParam, language]);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Focus OTP input when step changes to OTP
  useEffect(() => {
    if (staffStep === "otp") {
      otpInputRef.current?.focus();
    }
  }, [staffStep]);

  // Format 10-digit Indian phone
  const cleanDigits = phone.replace(/\D/g, "").slice(0, 10);
  const fullPhone = `+91${cleanDigits}`;

  const getDestination = (defaultRoute: string) => {
    if (redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//")) {
      return redirectParam;
    }
    return defaultRoute;
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setErrored(false);
    setMessage(null);
    if (tab === "staff") {
      setStaffStep("phone");
    }
  };

  // Staff: Send OTP
  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setMessage(null);
    setErrored(false);

    if (cleanDigits.length !== 10) {
      setErrored(true);
      setMessage(t.invalid_phone);
      return;
    }

    if (!isSupabaseConfigured()) {
      setErrored(true);
      setMessage(
        language === "hi"
          ? "सुपाबेस कॉन्फ़िगर नहीं है। कृपया .env.local में क्रेडेंशियल सेट करें।"
          : "Supabase credentials are not configured. Please check .env.local."
      );
      return;
    }

    setBusy(true);
    try {
      const { error } = await getClient().auth.signInWithOtp({
        phone: fullPhone,
      });

      setBusy(false);
      if (error) {
        setErrored(true);
        setMessage(error.message);
        return;
      }

      setStaffStep("otp");
      setResendCountdown(30);
      setOtp("");
    } catch (err: any) {
      setBusy(false);
      setErrored(true);
      setMessage(err?.message || "Failed to send OTP.");
    }
  }

  // Staff: Verify OTP
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setErrored(false);

    if (otp.length !== 6) {
      setErrored(true);
      setMessage(language === "hi" ? "कृपया 6 अंकों का OTP दर्ज करें" : "Please enter a valid 6-digit OTP");
      return;
    }

    setBusy(true);
    try {
      const { error } = await getClient().auth.verifyOtp({
        phone: fullPhone,
        token: otp,
        type: "sms",
      });

      if (error) {
        setBusy(false);
        setErrored(true);
        setMessage(error.message);
        return;
      }

      // Resolve staff role and account linking
      const res = await fetch("/api/login-resolve", { method: "POST" });
      const data = await res.json();
      setBusy(false);

      if (data.ok) {
        const dest = getDestination(data.redirectTo);
        router.replace(dest);
        router.refresh();
        return;
      }

      if (data.reason === "not_registered") {
        setStaffStep("not_registered");
        return;
      }

      setErrored(true);
      setMessage(data.message || t.resolve_error);
    } catch (err: any) {
      setBusy(false);
      setErrored(true);
      setMessage(err?.message || "Error verifying OTP.");
    }
  }

  // Admin: Sign in with Email / Password
  async function handleAdminSignIn(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setErrored(false);

    if (!isSupabaseConfigured()) {
      setErrored(true);
      setMessage(
        language === "hi"
          ? "सुपाबेस कॉन्फ़िगर नहीं है। कृपया .env.local में क्रेडेंशियल सेट करें।"
          : "Supabase credentials are not configured. Please check .env.local."
      );
      return;
    }

    setBusy(true);
    try {
      const { error } = await getClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setBusy(false);
        setErrored(true);
        setMessage(error.message);
        return;
      }

      // Resolve staff role and link account if provisioned
      const res = await fetch("/api/login-resolve", { method: "POST" });
      const data = await res.json();
      setBusy(false);

      if (data.ok) {
        const dest = getDestination(data.redirectTo);
        router.replace(dest);
        router.refresh();
        return;
      }

      if (data.reason === "not_registered") {
        setErrored(true);
        setMessage(t.not_registered_desc);
        return;
      }

      setErrored(true);
      setMessage(data.message || t.resolve_error);
    } catch (err: any) {
      setBusy(false);
      setErrored(true);
      setMessage(err?.message || "Failed to sign in.");
    }
  }

  const inputBase =
    "w-full rounded-ms-sm border border-ms-border bg-ms-surface px-4 py-3 text-ms-textPrimary " +
    "placeholder:text-ms-textDisabled transition-all " +
    "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

  return (
    <div className="flex min-h-screen min-h-dvh items-center justify-center bg-ms-bg px-4 py-12 relative">
      <div className="absolute top-4 right-4">
        <LangToggle />
      </div>

      <div className="w-full max-w-md">
        {/* Logo and Brand Header */}
        <div className="mb-6 text-center">
          <Link href="/" className="inline-block group">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand shadow-brand transition-transform group-hover:scale-105">
              <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-white" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/>
                <path d="M12 12v4M12 8v2M9 12h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
              </svg>
            </div>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-ms-textPrimary">{t.login_title}</h1>
          <p className="mt-1 text-sm text-ms-textSecondary">
            {t.login_subtitle}
          </p>
        </div>

        {/* Unconfigured Supabase Banner */}
        {!configured && (
          <div className="mb-4 flex items-start gap-2.5 rounded-ms-sm border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700/60 p-4 text-xs text-amber-900 dark:text-amber-200 shadow-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold">{t.supabase_not_configured_title}</p>
              <p className="mt-0.5 leading-relaxed">{t.supabase_not_configured_desc}</p>
            </div>
          </div>
        )}

        {/* Main Card */}
        <div className="rounded-ms-md border border-ms-border bg-ms-surface p-6 shadow-card-lg">
          {/* Two Role Tabs */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-ms-bg p-1 border border-ms-border">
            <button
              type="button"
              onClick={() => handleTabChange("staff")}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 px-3 text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "staff"
                  ? "bg-ms-surface text-brand shadow-sm font-bold border border-ms-border/50"
                  : "text-ms-textSecondary hover:text-ms-textPrimary"
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              <span>{t.tab_healthcare_staff}</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("admin")}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 px-3 text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "admin"
                  ? "bg-ms-surface text-warning shadow-sm font-bold border border-ms-border/50"
                  : "text-ms-textSecondary hover:text-ms-textPrimary"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{t.tab_district_admin}</span>
            </button>
          </div>

          {/* Error Banner */}
          {errored && message && (
            <div className="mb-5 flex items-start gap-2.5 rounded-ms-sm border border-[#EDB3B3] bg-critical-tint p-3.5 text-xs sm:text-sm text-critical ms-xfade">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">{message}</div>
            </div>
          )}

          {/* ----------------- TAB 1: HEALTHCARE STAFF (PHONE OTP) ----------------- */}
          {activeTab === "staff" && (
            <div>
              {staffStep === "phone" && (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <label htmlFor="phone-input" className="block text-sm font-medium text-ms-textPrimary">
                        {t.phone_number}
                      </label>
                      <span className="text-xs text-ms-textDisabled">
                        {t.staff_login_desc}
                      </span>
                    </div>

                    {/* Phone Input with +91 country badge */}
                    <div className="relative flex rounded-ms-sm shadow-sm">
                      <div className="inline-flex items-center gap-1 rounded-l-ms-sm border border-r-0 border-ms-border bg-ms-bg px-3 text-sm font-semibold text-ms-textSecondary select-none">
                        <span>🇮🇳</span>
                        <span>+91</span>
                      </div>
                      <input
                        id="phone-input"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        placeholder="98765 43210"
                        value={phone}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                          setPhone(val);
                          setErrored(false);
                          setMessage(null);
                        }}
                        className={`rounded-l-none ${inputBase}`}
                        autoFocus
                        required
                      />
                    </div>
                    <p className="mt-1 text-xs text-ms-textSecondary">{t.indian_number_note}</p>
                  </div>

                  <button
                    type="submit"
                    disabled={busy || cleanDigits.length !== 10}
                    className="
                      ms-press w-full rounded-ms-sm bg-brand px-4 py-3.5 text-base font-semibold
                      text-white shadow-brand transition-all hover:bg-brand-hover
                      disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2
                    "
                  >
                    {busy ? (
                      <>
                        <Spinner />
                        <span>{t.sending}</span>
                      </>
                    ) : (
                      <span>{t.send_code}</span>
                    )}
                  </button>

                  <p className="text-center text-xs text-ms-textDisabled pt-1">
                    {t.admin_provision_note}
                  </p>
                </form>
              )}

              {staffStep === "otp" && (
                <form onSubmit={handleVerifyOtp} className="space-y-4 ms-xfade">
                  <div className="flex items-center justify-between rounded-ms-sm border border-brand-light bg-brand-tint px-3.5 py-2.5 text-xs sm:text-sm text-brand">
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>{t.code_sent_to} <strong>+91 {cleanDigits}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStaffStep("phone");
                        setOtp("");
                        setErrored(false);
                        setMessage(null);
                      }}
                      className="ml-2 flex-shrink-0 text-xs font-semibold underline hover:text-brand-hover"
                    >
                      {t.change_number}
                    </button>
                  </div>

                  <div>
                    <label htmlFor="otp-input" className="mb-1.5 block text-sm font-medium text-ms-textPrimary text-center">
                      {t.six_digit_otp}
                    </label>
                    <input
                      ref={otpInputRef}
                      id="otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="one-time-code"
                      placeholder="· · · · · ·"
                      value={otp}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setOtp(val);
                        setErrored(false);
                        setMessage(null);
                      }}
                      className={`text-center text-2xl sm:text-3xl font-bold tracking-[0.5em] sm:tracking-[0.6em] ${inputBase}`}
                    />
                  </div>

                  {/* Resend Countdown */}
                  <div className="flex items-center justify-center text-xs text-ms-textSecondary">
                    {resendCountdown > 0 ? (
                      <span>
                        {t.resend_in} <strong className="font-mono text-ms-textPrimary">{resendCountdown}s</strong>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendOtp()}
                        disabled={busy}
                        className="inline-flex items-center gap-1 font-semibold text-brand hover:underline disabled:opacity-50"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>{t.resend_otp}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={busy || otp.length !== 6}
                    className="
                      ms-press w-full rounded-ms-sm bg-brand px-4 py-3.5 text-base font-semibold
                      text-white shadow-brand transition-all hover:bg-brand-hover
                      disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2
                    "
                  >
                    {busy ? (
                      <>
                        <Spinner />
                        <span>{t.verifying}</span>
                      </>
                    ) : (
                      <span>{t.verify_code}</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStaffStep("phone");
                      setOtp("");
                      setErrored(false);
                      setMessage(null);
                    }}
                    className="w-full text-center text-xs sm:text-sm text-ms-textSecondary hover:text-ms-textPrimary"
                  >
                    {t.use_different_number}
                  </button>
                </form>
              )}

              {staffStep === "not_registered" && (
                <div className="space-y-4 text-center ms-xfade">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-tint text-warning">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <p className="font-semibold text-ms-textPrimary text-base">{t.not_registered}</p>
                  <p className="text-xs sm:text-sm text-ms-textSecondary leading-relaxed">
                    {t.not_registered_desc}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffStep("phone");
                      setOtp("");
                      setMessage(null);
                      setErrored(false);
                    }}
                    className="w-full rounded-ms-sm border border-ms-border px-4 py-3 text-sm font-medium hover:bg-ms-bg transition-colors"
                  >
                    {t.try_different_method}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ----------------- TAB 2: DISTRICT ADMINISTRATOR (EMAIL / PWD) ----------------- */}
          {activeTab === "admin" && (
            <form onSubmit={handleAdminSignIn} className="space-y-4 ms-xfade">
              <div>
                <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium text-ms-textPrimary">
                  {t.admin_email_label}
                </label>
                <input
                  id="admin-email"
                  type="email"
                  placeholder="admin@district.gov.in"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrored(false);
                    setMessage(null);
                  }}
                  className={inputBase}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-ms-textPrimary">
                  {t.admin_password_label}
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrored(false);
                      setMessage(null);
                    }}
                    className={`pr-10 ${inputBase}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ms-textDisabled hover:text-ms-textPrimary transition-colors p-1"
                    title={showPassword ? t.hide_password : t.show_password}
                    aria-label={showPassword ? t.hide_password : t.show_password}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || !email || !password}
                className="
                  ms-press w-full rounded-ms-sm bg-warning px-4 py-3.5 text-base font-semibold
                  text-white shadow-card transition-all hover:bg-warning-hover active:scale-[0.99]
                  disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2
                "
              >
                {busy ? (
                  <>
                    <Spinner />
                    <span>{t.signing_in}</span>
                  </>
                ) : (
                  <span>{t.admin_signin_btn}</span>
                )}
              </button>

              <p className="text-center text-xs text-ms-textDisabled pt-1 leading-normal">
                {t.admin_provision_note}
              </p>
            </form>
          )}
        </div>

        {/* Public Availability Lookup Link */}
        <p className="mt-6 text-center text-sm text-ms-textSecondary">
          {t.looking_for_medicine}{" "}
          <Link href="/availability" className="font-semibold text-brand underline-offset-2 hover:underline">
            {t.open_public_lookup}
          </Link>
        </p>
      </div>
    </div>
  );
}

function Spinner({ className = "text-white" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );
}
