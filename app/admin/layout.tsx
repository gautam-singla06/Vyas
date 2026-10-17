import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff, getAuthUser } from "@/lib/auth/context";
import { isServerSupabaseConfigured } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import SignOutButton from "@/components/SignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isServerSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-ms-bg p-6 flex items-center justify-center">
        <div className="max-w-md w-full rounded-ms-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 p-6 text-amber-900 dark:text-amber-200 shadow-card">
          <h2 className="text-lg font-bold">Supabase Not Configured</h2>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
            Please configure your Supabase environment variables in <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">.env.local</code> to access the District Admin portal.
          </p>
          <div className="mt-4">
            <Link href="/" className="text-sm font-semibold text-brand underline">← Return to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  const user = await getAuthUser();
  if (!user) {
    redirect("/login?redirect=/admin");
  }

  const staff = await getCurrentStaff();

  return (
    <div className="min-h-screen min-h-dvh bg-ms-bg">
      {/* Top header bar */}
      <header className="sticky top-0 z-40 border-b border-ms-border bg-ms-surface shadow-card">
        <div className="mx-auto flex max-w-admin items-center gap-3 px-4 py-3 sm:px-6">
          {/* Orange-amber accent for admin */}
          <div className="h-8 w-1 rounded-full bg-warning" aria-hidden="true" />

          <div className="flex flex-1 items-center gap-2 min-w-0">
            <Link href="/" className="font-semibold text-ms-textPrimary hover:text-brand transition-colors">
              Vyas
            </Link>
            <span className="text-ms-border" aria-hidden="true">·</span>
            <span className="text-sm font-medium text-ms-textSecondary">District Admin</span>
            {staff && (
              <span className="hidden truncate text-sm text-ms-textDisabled sm:block">
                · {staff.name} · {staff.district}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Weekly report */}
            <a
              href="/api/admin/report"
              download
              title="Download weekly report"
              className="hidden rounded-ms-sm border border-ms-border px-3 py-2 text-sm text-ms-textSecondary transition-colors hover:border-brand hover:text-brand sm:flex items-center gap-1.5"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M7.47 10.78a.75.75 0 001.06 0l3.75-3.75a.75.75 0 00-1.06-1.06L8.75 8.44V1.75a.75.75 0 00-1.5 0v6.69L4.78 5.97a.75.75 0 00-1.06 1.06l3.75 3.75zM3.75 13a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z"/>
              </svg>
              Weekly Report
            </a>
            <ThemeToggle />
            <SignOutButton className="rounded-ms-sm border border-ms-border px-3 py-2 text-sm text-ms-textSecondary transition-colors hover:border-brand hover:text-brand" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-admin px-4 py-6 sm:px-6">
        {!staff ? (
          <div className="rounded-ms-md border border-[#E8C97A] bg-warning-tint p-5 text-sm text-warning">
            <p className="font-semibold">Account not registered</p>
            <p className="mt-1">Your phone number is not in Vyas.{" "}
              <SignOutButton className="font-medium underline" />
            </p>
          </div>
        ) : staff.role !== "admin" ? (
          <div className="rounded-ms-md border border-[#E8C97A] bg-warning-tint p-5 text-sm text-warning">
            <p className="font-semibold">Wrong role</p>
            <p className="mt-1">This dashboard is for district admins only. You are signed in as <strong>{staff.role}</strong>.</p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
