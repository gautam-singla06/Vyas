import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-side Supabase client. Lazy: doesn't throw at import or component
// render if env keys are absent (e.g., during a static build with no .env).
// The error surfaces on the first real auth call, which is what we want —
// the UI can render (and show a "backend not configured" state) without
// crashing the page just because the env isn't wired.
let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && anon && url.startsWith("http"));
}

export function createClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anon || !url.startsWith("http")) {
    console.warn(
      "Supabase env not configured — auth calls will fail. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
    // Construct a safe dummy client so React hydration doesn't crash on initial render.
    cached = createSSRBrowserClient("https://unconfigured.supabase.co", "unconfigured-anon-key");
    return cached;
  }

  cached = createSSRBrowserClient(url, anon);
  return cached;
}
