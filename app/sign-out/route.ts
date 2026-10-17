import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// POST-only sign-out. A state-changing action must not be reachable via GET —
// a GET sign-out is trivially CSRF-able (`<img src="/sign-out">` on any page
// would force-log-out the user). Callers submit a same-origin <form method
//="post">, which browsers only issue on real user intent. Clears the server
// session and returns to the app origin (303 so the redirect is followed as a
// GET), using the request's own origin so it works on localhost and Vercel.
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();

  const home = new URL("/", request.nextUrl.origin);
  return NextResponse.redirect(home, { status: 303 });
}
