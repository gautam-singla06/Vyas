import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff, getAuthUser } from "@/lib/auth/context";
import { isServerSupabaseConfigured } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import SignOutButton from "@/components/SignOutButton";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  if (!isServerSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-ms-bg p-6 flex items-center justify-center">
        <div className="max-w-md w-full rounded-ms-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 p-6 text-amber-900 dark:text-amber-200 shadow-card">
          <h2 className="text-lg font-bold">Supabase Not Configured</h2>
          <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
            Please configure your Supabase environment variables in <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">.env.local</code> to access the Staff portal.
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
    redirect("/login?redirect=/staff");
  }

  const staff = await getCurrentStaff();

  return (
    <div className="min-h-screen min-h-dvh bg-ms-bg">
      {/* Header — brand teal left accent */}
      <header className="sticky top-0 z-40 border-b border-ms-border bg-ms-surface shadow-card">
        <div className="mx-auto flex max-w-content items-center gap-3 px-4 py-3 sm:px-6">
          {/* Left accent strip */}
          <div className="h-8 w-1 rounded-full bg-brand" aria-hidden="true" />

          <div className="flex flex-1 items-center gap-2 min-w-0">
            <Link href="/" className="font-semibold text-ms-textPrimary hover:text-brand transition-colors">
              Vyas
            </Link>
            <span className="text-ms-border" aria-hidden="true">·</span>
            <span className="text-sm font-medium text-ms-textSecondary">Staff</span>
            {staff && (
              <span className="hidden truncate text-sm text-ms-textDisabled sm:block">
                · {staff.name} · {staff.facilityName} · {staff.role}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <LangToggle />
            <div className="h-4 w-px bg-ms-border mx-1" aria-hidden="true" />
            <ThemeToggle />
            <SignOutButton className="rounded-ms-sm border border-ms-border px-3 py-2 text-sm text-ms-textSecondary transition-colors hover:border-brand hover:text-brand" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-content px-4 py-6 sm:px-6">
        {!staff ? (
          <div className="rounded-ms-md border border-[#E8C97A] bg-warning-tint p-5 text-sm text-warning">
            <p className="font-semibold">Account not registered</p>
            <p className="mt-1">Your phone number is not registered as Vyas staff. Contact your district admin to be added.{" "}
              <SignOutButton className="font-medium underline" />
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
