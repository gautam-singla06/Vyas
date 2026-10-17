# Comprehensive Code Review — Vyas Codebase

## 🔴 Top 5 Most Urgent Issues

| # | Severity | File | Summary |
|---|----------|------|---------|
| 1 | **Critical** | [server.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/supabase/server.ts#L15-L38) | Supabase server client is cached across requests — stale auth, cross-user data leaks |
| 2 | **Critical** | [router.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/ats/router.ts#L97) | Broken Supabase query API call (`supabase.select()` is not a function) |
| 3 | **Critical** | [sms-webhook/route.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/api/sms-webhook/route.ts) & [whatsapp-webhook/route.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/api/whatsapp-webhook/route.ts) | Webhooks have no request signature verification — spoofable by anyone |
| 4 | **High** | [rate-limit.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/rate-limit.ts#L19-L60) | Rate limiter is non-atomic (read-then-write race) and upsert logic is broken |
| 5 | **High** | [agent.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/ai/agent.ts#L196) | AI agent tool functions use unparameterized `ilike` with user input — SQL/filter injection |

---

## 1. BUGS & LOGIC ERRORS

### 🔴 CRITICAL: Module-level Supabase server client caching causes cross-request data leaks
**File:** [server.ts L15-38](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/supabase/server.ts#L15-L38)
**Description:** `cachedServer` is a module-level `let` that caches the Supabase client after the first request. In serverless (Vercel/AWS Lambda), the module scope persists across warm invocations. Once cached, **every subsequent request reuses the first user's cookie store**, meaning:
- User A's session cookies are served to User B
- Auth state leaks between requests
- RLS checks run under the wrong user

**Fix:** Remove the module-level cache entirely. The `cookies()` call is per-request and cheap.
```diff
- let cachedServer: SupabaseClient | null = null;
  export async function createServerClient(): Promise<SupabaseClient> {
-   if (cachedServer) return cachedServer;
    const cookieStore = await cookies();
-   cachedServer = createSSRClient(url(), anon(), {
+   return createSSRClient(url(), anon(), {
      cookies: { ... },
    });
-   return cachedServer;
  }
```

---

### 🔴 CRITICAL: Broken Supabase query in ATS router
**File:** [router.ts L97](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/ats/router.ts#L97)
**Description:** The call `supabase.select("id, name").from("facilities")` is invalid PostgREST syntax — `.select()` is called on the client, not on a table reference. The correct API is `supabase.from("facilities").select("id, name")`. This causes the entire `checkAvailabilityDeterministic` function to throw at runtime, silently failing all ATS availability queries.

**Fix:**
```diff
- const { data: facilities } = await supabase.select("id, name").from("facilities");
+ const { data: facilities } = await supabase.from("facilities").select("id, name");
```

---

### 🔴 CRITICAL: Incomplete rename from "MediServ" to "Vyas"
**File:** [router.ts L13-14](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/ats/router.ts#L13-L14)
**Description:** The greeting responses still say "MediServ" instead of "Vyas":
```ts
en: "Hello! I am the MediServ assistant..."
hi: "नमस्ते! मैं MediServ सहायक हूँ..."
```
The `rename.js` script did a global replace but missed this file (likely the file was added or modified after the rename was run).

**Fix:** Replace `MediServ` with `Vyas` in both greeting strings.

---

### 🟡 HIGH: `severityForStock` always returns a value for any positive `daysToZero` — overflagging
**File:** [forecast.ts L54-58](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/flagging-analytics/forecast.ts#L54-L58)
**Description:** The function returns `"watch"` for *any* `daysToZero > 7`, even 365 days. This means every stock item with any consumption history always gets flagged as at least "watch" severity — flooding the admin dashboard with noise. Per the architecture doc, "watch" should only apply to a "declining trend" outside the critical/warning thresholds, not unconditionally.

**Fix:** Add a threshold (e.g., `daysToZero <= 21`) or return `null` when the stock is healthy:
```diff
  if (daysToZero <= 3) return "critical";
  if (daysToZero <= 7) return "warning";
- return "watch";
+ if (daysToZero <= 21) return "watch";
+ return null; // stock is healthy — no flag needed
```

---

### 🟡 HIGH: `stock_logs.delta` recorded incorrectly in ATS structured stock update
**File:** [router.ts L189-195](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/ats/router.ts#L189-L195)
**Description:** When the ATS router handles a `STOCK Paracetamol 50` command, it sets `quantity = 50` on `stock_items` but then inserts `delta: qty` (the absolute quantity, e.g. 50) into `stock_logs`. The `delta` field in `stock_logs` is supposed to record the *change* (+/- from the old value), not the new absolute quantity. This corrupts the stock forecast calculations since the forecaster interprets these as consumption or restock events.

**Fix:** Either compute the actual delta by reading the old quantity first, or use the existing `restockTo` / `adjustStock` Server Actions which handle this correctly.

---

### 🟡 HIGH: `patient-access/actions.ts` — `headers()` must be awaited in Next.js 16
**File:** [actions.ts L18](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/patient-access/actions.ts#L18)
**Description:** In Next.js 16, `headers()` is async and returns a Promise. The code calls `headers().get("x-forwarded-for")` without `await`, which will return `undefined` on the Promise object, and the IP always resolves to `"unknown-ip"` — defeating rate limiting entirely.

**Fix:**
```diff
- const ip = headers().get("x-forwarded-for") || "unknown-ip";
+ const hdrs = await headers();
+ const ip = hdrs.get("x-forwarded-for") || "unknown-ip";
```

---

### 🟡 MEDIUM: `redistribution/runner.ts` — `deficitRow` doesn't select `district` column
**File:** [runner.ts L37-41, L49](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/redistribution/runner.ts#L37-L49)
**Description:** The query `.select("id, name, lat, lng")` doesn't include `district`, but L49 accesses `(deficitRow as { district?: string }).district` — this will always be `undefined`, causing the donor facilities query to filter by `district = ""` and return no results. All redistribution suggestions will silently produce zero matches.

**Fix:**
```diff
- .select("id, name, lat, lng")
+ .select("id, name, lat, lng, district")
```

---

### 🟡 MEDIUM: Phone normalization edge case — non-Indian numbers silently mangled
**File:** [login-client.tsx L30-35](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/login/login-client.tsx#L30-L35)
**Description:** `normalizePhone` assumes all phone numbers are Indian. If a number has exactly 10 digits but is not Indian (e.g., US number), it incorrectly prepends `+91`. The condition `digits.startsWith("91") || digits.length === 10` is overly broad.

---

### 🟡 MEDIUM: Login flow shows phone form on "error" step
**File:** [login-client.tsx L256](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/login/login-client.tsx#L256)
**Description:** `step === "phone" || step === "error"` renders the phone form even when the error came from the *email* flow (step was set to "error" from `signInWithEmail`). The user sees the phone form with an email error message, which is confusing.

**Fix:** Track which sub-flow produced the error and show the corresponding form.

---

### 🟡 LOW: `public/layout.tsx` imports unused components
**File:** [layout.tsx L1-2](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/public/layout.tsx#L1-L2)
**Description:** `Link` and `ThemeToggle` are imported but never used in the JSX. Dead imports increase bundle size.

---

## 2. SECURITY VULNERABILITIES

### 🔴 CRITICAL: SMS & WhatsApp webhooks have no request signature verification
**Files:** [sms-webhook/route.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/api/sms-webhook/route.ts), [whatsapp-webhook/route.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/api/whatsapp-webhook/route.ts)
**Description:** Both webhook endpoints accept any POST request without verifying Twilio's `X-Twilio-Signature` header. An attacker can:
- Spoof stock updates from any "phone number"
- Trigger arbitrary AI agent queries
- Exhaust rate limits for legitimate users
- Inject data into `chat_logs`

**Fix:** Validate the Twilio signature using `TWILIO_AUTH_TOKEN`:
```ts
import crypto from "crypto";
function validateTwilioSignature(url: string, params: Record<string, string>, signature: string, authToken: string): boolean {
  const sorted = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url);
  const expected = crypto.createHmac("sha1", authToken).update(sorted).digest("base64");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

---

### 🟡 HIGH: AI agent tool functions use user-controlled input in `ilike` filters without sanitization
**File:** [agent.ts L196-227](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/ai/agent.ts#L196-L227)
**Description:** All tool functions pass LLM-parsed arguments directly into Supabase `ilike` filters:
```ts
.ilike("name", `%${args.facilityName}%`)
```
The `%` and `_` characters in user input are SQL wildcards. An attacker crafting a query like `facilityName: "%"` would match all facilities. While RLS prevents mutation, it leaks data breadth and could aid reconnaissance.

**Fix:** Escape `%` and `_` in user inputs before passing to `ilike`:
```ts
const escapeLike = (s: string) => s.replace(/%/g, '\\%').replace(/_/g, '\\_');
```

---

### 🟡 HIGH: `sign-out` uses GET method — CSRF vulnerable
**File:** [sign-out/route.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/sign-out/route.ts)
**Description:** Sign-out is triggered via `GET` request. Any page can embed `<img src="/sign-out">` and force the user to sign out (CSRF). Sign-out should be POST-only with a CSRF token, or at minimum use `SameSite=Strict` cookies.

---

### 🟡 MEDIUM: Admin flags API allows unauthenticated POST
**File:** [flags/route.ts](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/api/admin/flags/route.ts)
**Description:** The POST handler calls `getDistrictFlags()` which internally checks auth, but if the user is unauthenticated it returns an empty array rather than a 401. This is a minor information leak (reveals the endpoint exists and responds) and inconsistent with REST conventions.

---

### 🟡 MEDIUM: Rate limiter fails open
**File:** [rate-limit.ts L38-41](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/rate-limit.ts#L38-L41)
**Description:** When the rate limit DB query fails, the function returns `{ allowed: true }`. An attacker who can make the `rate_limits` table fail (e.g., by corrupting the table or exceeding connection limits) bypasses all rate limiting. Consider failing closed for security-sensitive endpoints.

---

### 🟡 LOW: XSS in SMS/WhatsApp TwiML response
**Files:** [sms-webhook/route.ts L37](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/api/sms-webhook/route.ts#L37), [whatsapp-webhook/route.ts L38](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/api/whatsapp-webhook/route.ts#L38)
**Description:** The XML escaping only handles `&`, `<`, `>` but misses `"` and `'`. While TwiML is parsed by Twilio (not a browser), malformed XML could cause parsing failures. Use a proper XML escaper.

---

## 3. PERFORMANCE ISSUES

### 🟡 HIGH: `sweepDoctorAbsence` is N+1 — one query per facility
**File:** [runner.ts L236-262](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/flagging-analytics/runner.ts#L236-L262)
**Description:** The sweep loads all facilities, then runs one `doctor_attendance` query per facility in a `for` loop. For a district with 100 facilities, this makes 101 sequential DB roundtrips. This should be a single aggregation query.

**Fix:**
```sql
SELECT facility_id, count(*) as doc_count
FROM doctor_attendance
WHERE check_in >= :startOfToday AND check_in <= :cutoff
GROUP BY facility_id
```
Then compare against the full facilities list in-memory.

---

### 🟡 HIGH: Admin queries make redundant `getCurrentStaff()` calls
**Files:** [admin/page.tsx L12](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/admin/page.tsx#L12), [queries.ts L43-46](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/admin/queries.ts#L43-L46)
**Description:** `AdminPage` calls `getCurrentStaff()` once, then `getDistrictFlags()`, `getDistrictFacilities()`, and `getDistrictSuggestions()` each call `getCurrentStaff()` again internally. That's 4 `supabase.auth.getUser()` + 4 staff table reads for a single page load. The staff context should be resolved once and passed down.

---

### 🟡 MEDIUM: `getDistrictSuggestions` fetches all suggestions then fetches all facilities separately
**File:** [queries.ts L106-136](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/admin/queries.ts#L106-L136)
**Description:** Two separate queries (suggestions + facilities) instead of a single join. The facility names could be resolved via a Supabase foreign-key join in the same query.

---

### 🟡 MEDIUM: `sync-provider.tsx` — immediate sync on enqueue scans the entire queue in reverse
**File:** [sync-provider.tsx L133](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/offline/sync-provider.tsx#L133)
**Description:** `db.writeQueue.orderBy("createdAt").reverse().toArray()` loads the entire IndexedDB queue into memory just to find the last-added row. Use `.last()` or query with `.reverse().first()` instead.

---

### 🟡 LOW: `footfall` increment is read-then-write instead of atomic upsert
**File:** [actions.ts L310-348](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/resource-monitoring/actions.ts#L310-L348)
**Description:** The footfall increment reads the current count, adds 1, then writes. Under concurrency, two simultaneous increments will both read count=N and write count=N+1, losing one increment. Use an RPC or `UPDATE ... SET count = count + 1`.

---

## 4. CODE QUALITY & MAINTAINABILITY

### 🟡 HIGH: `LandingStoryClient.tsx` is 30KB / 750+ LOC in a single component
**File:** [LandingStoryClient.tsx](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/components/LandingStoryClient.tsx) (30,132 bytes)
**Description:** This is an extremely large single component file. It should be decomposed into smaller section components (HeroSection, StatsSection, RolesSection, etc.) for maintainability and code-splitting.

---

### 🟡 MEDIUM: `"use server"` on `gemini.ts` is incorrect
**File:** [gemini.ts L1](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/ai/gemini.ts#L1)
**Description:** The `"use server"` directive makes every export a Server Action callable from the client. `complete()` and `generateFlagExplanation()` are internal functions that should NOT be exposed as callable Server Actions. They accept arbitrary message arrays which could be used to proxy arbitrary LLM calls through the server.

**Fix:** Remove `"use server"` from gemini.ts. Only files that explicitly define form/button-invocable Server Actions should have this directive.

---

### 🟡 MEDIUM: `replay.ts` has `"use server"` but is called from a client component
**File:** [replay.ts L1](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/offline/replay.ts#L1)
**Description:** `replayAction` is marked `"use server"` and is imported by the client-side `SyncProvider`. This technically works (Next.js wraps it as a server action call), but it means every offline queue flush makes individual HTTP round-trips through the server-action boundary, adding latency and overhead. A batch API would be more efficient.

---

### 🟡 MEDIUM: Inconsistent error handling patterns
**Description:** Some functions throw on error (e.g., `createServiceClient`), some return null (e.g., `getCurrentStaff`), some return `{ ok: false }` (Server Actions), and some silently swallow errors with console.error. The codebase would benefit from a consistent error handling strategy documented in an ADR.

---

### 🟡 MEDIUM: Test coverage is minimal
**Description:** Only 3 test files exist:
- `forecast.test.ts` — good, thorough
- `matching.test.ts` — good, thorough
- `gemini.test.ts` — stub (just checks the function exists)

No tests for: Server Actions, auth flows, rate limiter, ATS router, pipeline, replay logic, webhooks, or any React components.

---

### 🟡 LOW: `domain/types.ts` has both `QueuedAction` and `lib/offline/db.ts` has `QueuedRow` with overlapping schemas
**Files:** [domain/types.ts L29-35](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/domain/types.ts#L29-L35), [db.ts L10-17](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/offline/db.ts#L10-L17)
**Description:** Two near-identical interfaces (`QueuedAction` and `QueuedRow`) with slightly different field names (`actionKey` vs `action`). One should be canonical.

---

### 🟡 LOW: `rename.js` is committed in the repo as a one-time migration script
**File:** [rename.js](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/rename.js)
**Description:** This is a one-off script used to rename "MediServ" to "Vyas". It should either be removed from the repo or moved to a `scripts/` directory. It also didn't catch the ATS router greeting (see Bug #3 above).

---

### 🟡 LOW: Multiple empty barrel index files
**Files:** `domain/resource-monitoring/index.ts`, `domain/workforce/index.ts`, `domain/patient-access/index.ts`, `components/index.ts`, `lib/ai/index.ts`
**Description:** These files just `export {}` with a comment. They add no value and clutter the file tree.

---

## 5. UI/UX GLITCHES

### 🟡 MEDIUM: SyncBanner overlaps sticky headers when offline
**File:** [SyncBanner.tsx L28-63](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/components/SyncBanner.tsx#L28-L63)
**Description:** The sync banner is `fixed inset-x-0 top-0 z-[60]` and the layout headers are `sticky top-0 z-40`. When offline, the banner and header stack on top of each other, with the banner covering the header. The main content doesn't have a `padding-top` offset for the banner height.

**Fix:** When the banner is visible, add top padding to the body or use a layout shift approach.

---

### 🟡 MEDIUM: `LanguageContext` hides all children until mounted
**File:** [LanguageContext.tsx L44-48](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/lib/i18n/LanguageContext.tsx#L44-L48)
**Description:** `{!mounted ? <div style={{ visibility: "hidden" }}>{children}</div> : children}` hides the entire app until the language is loaded from localStorage. On slow devices this can cause a flash of invisible content (FOIC). The `visibility: hidden` still takes up layout space, so the page dimensions are correct, but the user sees nothing — potentially for several hundred milliseconds on budget phones.

---

### 🟡 LOW: Accessibility — LangToggle buttons lack `aria-pressed` or `role="radio"`
**File:** [LangToggle.tsx](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/components/LangToggle.tsx)
**Description:** The language toggle is visually a segmented control but semantically just two buttons. Screen readers won't know which language is selected. Use `aria-pressed` or a proper radiogroup pattern.

---

### 🟡 LOW: `viewport.maximumScale: 1` prevents pinch-to-zoom
**File:** [layout.tsx L25](file:///c:/Users/gauta/OneDrive/Desktop/Vyas/app/layout.tsx#L25)
**Description:** `maximumScale: 1` is an accessibility anti-pattern — it prevents users with low vision from zooming in. WCAG 1.4.4 requires that content can be resized up to 200%.

**Fix:** Remove `maximumScale: 1` or set it to at least `5`.

---

## Summary Statistics

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Bugs & Logic | 3 | 3 | 2 | 1 |
| Security | 1 | 2 | 2 | 1 |
| Performance | — | 2 | 2 | 1 |
| Code Quality | — | 1 | 4 | 3 |
| UI/UX | — | — | 2 | 2 |
| **Totals** | **4** | **8** | **12** | **8** |

> **Overall Assessment:** The codebase has solid architectural foundations (domain separation, offline-first design, RLS security layers, good test coverage for pure functions). However, the **module-level Supabase server client cache is a production-blocking bug** that can cause cross-user data leaks. The missing webhook authentication and the broken ATS query are the next priorities. After fixing the critical/high issues, the codebase would be in good shape for production with moderate cleanup.
