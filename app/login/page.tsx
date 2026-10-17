import { Suspense } from "react";
import LoginClient from "./login-client";

// Force dynamic so the route isn't statically prerendered against an env-less
// build sandbox — the Supabase client is constructed lazily in the browser.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-ms-bg">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
