# BUILD.md — Vyas Implementation Guide

This is the execution layer on top of `ARCHITECTURE.md`, `DESIGN.md`, and `DECISIONS.md`. Every phase below has a self-contained prompt you can paste directly into a coding AI (Claude Code, Cursor, etc.). Run phases **in order** — each one assumes the schema, auth, and folder structure from the phases before it.

Each prompt is written to be dropped in as-is, but attach `DECISIONS.md` and `DESIGN.md` to the coding session if you can — the prompts reference specific ADRs and won't re-explain rationale that's already settled.

**Consistency check note:** `footfall_logs` is treated as part of the Resource Monitoring bounded context throughout this guide, since DESIGN.md's five contexts didn't explicitly assign it. Adjust Phase 1 if you intended it elsewhere.

---

## Phase 0 — Repo & Environment Scaffolding

```
Set up a new Next.js 14+ project (App Router, TypeScript, Tailwind CSS) for a project called Vyas, per ADR-001 (modular monolith, no separate backend service).

Folder structure — organize by the five DDD bounded contexts from DESIGN.md Section 5, not generic CRUD folders:

/app
  /(staff)          — nurse/pharmacist views, role-gated
  /(doctor)         — attendance check-in/out
  /(admin)          — district admin dashboard
  /(public)         — patient lookup, no auth required
  /api               — API routes reserved for stable HTTP contracts only (e.g. Twilio webhook), per ADR-001
/lib
  /supabase          — client wrappers (browser + server)
  /ai                — Gemini/OpenRouter client, forecast engine, severity rules, redistribution matcher
  /offline            — IndexedDB queue + sync logic
  /i18n               — English/Hindi string dictionaries
/domain
  /resource-monitoring  — stock, bed, test availability, footfall
  /workforce             — doctor attendance
  /flagging-analytics    — forecast, severity tiering, flags lifecycle
  /redistribution         — Haversine matching
  /patient-access          — read-only lookup, chatbot
/components          — shared UI (severity badge, offline banner, voice button, etc. — see DESIGN system in a future design pass)

Install and configure:
- next-pwa (per ADR-003's service worker + app-shell caching requirement)
- @supabase/supabase-js and @supabase/ssr
- dexie (IndexedDB wrapper for the offline write queue)
- leaflet + react-leaflet (per ADR-011 — OpenStreetMap, not Google Maps)
- zod (for schema-validating AI-extracted JSON before any write path, per Section 7 of DESIGN.md)

Set up .env.local with placeholders for:
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER

Do not implement any feature logic yet — this phase is scaffolding only. Confirm the app builds and runs with a blank placeholder page per route group.
```

---

## Phase 1 — Database Schema & Row Level Security (Supabase)

```
Using the Supabase project's SQL editor (or a migration file under /supabase/migrations), create the Vyas schema exactly as specified in ARCHITECTURE.md Section 7 and referenced throughout DECISIONS.md.

Tables (with types, constraints, and foreign keys):

facilities: id (uuid, pk), name (text), type (enum: 'PHC'|'CHC'), district (text), block (text), lat (numeric), lng (numeric), abdm_facility_id (text, nullable — reserved per DECISIONS.md ADR-010's roadmap note)

staff: id (uuid, pk, references auth.users), facility_id (uuid, fk -> facilities), role (enum: 'nurse'|'pharmacist'|'doctor'|'admin'), phone (text, unique), name (text)

stock_items: id (uuid, pk), facility_id (uuid, fk), item_name (text), quantity (integer), unit (text), updated_at (timestamptz), updated_by (uuid, fk -> staff)

stock_logs: id (uuid, pk), stock_item_id (uuid, fk), delta (integer), source (enum: 'app'|'voice'|'sms'), created_at (timestamptz)
  -- append-only, never updated or deleted, per ADR-003's audit trail requirement

bed_status: facility_id (uuid, pk/fk), total (integer), occupied (integer), updated_at (timestamptz)
  -- flat model, no ICU/NICU/ventilator sub-types, per ADR-010

doctor_attendance: id (uuid, pk), staff_id (uuid, fk), facility_id (uuid, fk), check_in (timestamptz), check_out (timestamptz, nullable), geo_lat (numeric), geo_lng (numeric)

test_availability: id (uuid, pk), facility_id (uuid, fk), test_name (text), is_functional (boolean), updated_at (timestamptz)
  -- binary only, no hardcoded CT/MRI/ECG taxonomy, per ADR-010

footfall_logs: id (uuid, pk), facility_id (uuid, fk), date (date), count (integer)
  -- anonymous counter only, no patient identity, per ADR-010

flags: id (uuid, pk), facility_id (uuid, fk), category (enum: 'stock'|'bed'|'doctor'|'test'), severity (enum: 'critical'|'warning'|'watch'), reason_text_en (text, nullable), reason_text_hi (text, nullable), created_at (timestamptz), resolved (boolean, default false)
  -- severity + row creation must happen BEFORE reason_text is populated, per ADR-005's deterministic-then-generative staging — do not make reason_text required at insert time

redistribution_suggestions: id (uuid, pk), item_name (text), from_facility_id (uuid, fk), to_facility_id (uuid, fk), suggested_qty (integer), distance_km (numeric), status (enum: 'pending'|'actioned'|'dismissed'), created_at (timestamptz)

chat_logs: id (uuid, pk), facility_id (uuid, nullable, fk), patient_session (text, nullable — anonymous session token, no identity), language (enum: 'en'|'hi'), message (text), response (text), created_at (timestamptz)

Row Level Security (per ADR-007 — this is a hard requirement, not optional):
- Enable RLS on every table above except facilities (read-open) and chat_logs (patient_session rows are insert-only, no auth required).
- staff/doctor_attendance/stock_items/stock_logs/bed_status/test_availability/footfall_logs: a row is writable only if the authenticated user's staff.facility_id matches the row's facility_id.
- flags/redistribution_suggestions: writable only by the service role (server-side AI module), readable by admin role across their district and by staff for their own facility.
- district admin role: read access across all facilities in their district (join through facilities.district).

Write the RLS policies as actual SQL, not just a description. Include a seed script with 5 realistic facilities (mix of PHC/CHC) across one district, with plausible lat/lng, for demo purposes.
```

---

## Phase 2 — Authentication (Phone/OTP)

```
Implement authentication per DECISIONS.md ADR-007: Supabase Auth with phone/OTP provider, no Google OAuth.

Requirements:
- A sign-in page at /login: phone number input → OTP sent → OTP verification → session created.
- On first sign-in, if no matching row exists in the staff table for that phone number, show a "not registered" state — staff accounts are provisioned by an admin seed process, not self-signup, since this is a closed field-staff tool, not a public product.
- After successful auth, read the staff table to get the user's role and facility_id, and store this in a server-side session/context accessible to Server Actions and RLS checks.
- Role-based redirect after login: nurse/pharmacist → /(staff), doctor → /(doctor), admin → /(admin).
- Patient-facing routes under /(public) must remain fully accessible with no auth check at all, per ADR-008 — do not add a login gate here even accidentally via shared layout logic.
- Add a middleware.ts that protects (staff), (doctor), and (admin) route groups, redirecting unauthenticated users to /login, but explicitly excludes (public) routes from this check.

Test the RLS boundary end-to-end: confirm a nurse authenticated for Facility A cannot read or write Facility B's stock_items via a direct Supabase client call, not just via the UI.
```

---

## Phase 3 — Resource Monitoring Module (Stock, Bed, Test Availability, Footfall)

```
Build the Resource Monitoring domain module (/domain/resource-monitoring) covering stock_items, bed_status, test_availability, and footfall_logs, per ARCHITECTURE.md Section 6 and DESIGN.md Section 5.

UI requirements (per Design Principle #2 — one tap beats one form):
- Stock update screen: search/select an item, then +/- quantity buttons (not a numeric form field for the common case). Every write also inserts a stock_logs row with the delta and source='app'.
- Bed status: a single screen with an occupied/available toggle or +/- counter against bed_status.total, not a multi-field form.
- Test availability: a list of test/equipment names for the facility, each with a single Y/N toggle against is_functional.
- Footfall: a single large "+1 patient" button that upserts today's footfall_logs row (increment count, or insert if no row exists for today).

Server Actions only — no client-side fetch to a separate API route for these writes, per ADR-001. Each action must:
1. Verify the caller's facility_id (from session) matches the target row's facility_id — defense in depth even though RLS already enforces this at the DB layer.
2. Perform the write.
3. Return a result shape the offline queue (Phase 6) can replay identically whether called live or from a queued sync.

Do not wire up the AI forecast trigger yet — that's Phase 7. This phase is data capture only.
```

---

## Phase 4 — Workforce Module (Doctor Attendance)

```
Build the Workforce domain module (/domain/workforce) covering doctor_attendance, per ARCHITECTURE.md Section 6.

UI: a single screen for the doctor role with one button that toggles between "Check In" and "Check Out" based on whether an open (check_out IS NULL) attendance row exists for today.

On check-in: use the browser Geolocation API to capture lat/lng, insert a new doctor_attendance row with check_in = now(), geo_lat, geo_lng.
On check-out: update the existing open row with check_out = now().

Handle geolocation permission denial gracefully — do not block check-in entirely if location is unavailable; log the attendance event with null geo coordinates rather than failing the action, since the primary signal (did the doctor show up) matters more than the secondary signal (exactly where).

Per DESIGN.md's persona notes: this must take under 5 seconds and should not feel punitive in tone — no UI copy implying surveillance ("tracking you"), just a plain check-in/check-out action.
```

---

## Phase 5 — Offline-First Sync Layer

```
Implement the offline-first write queue exactly as specified in DECISIONS.md ADR-003 and DESIGN.md Section 6, Flow 1. This is the most consequential feature in the system — treat it as core, not a stretch add-on.

Architecture:
- Use Dexie.js over IndexedDB to create a local `writeQueue` table: { id, domain, action, payload, createdAt, synced: boolean }.
- Every write-triggering UI action (from Phases 3 and 4) must: (1) apply an optimistic UI update immediately, (2) enqueue the write in Dexie, (3) attempt an immediate sync if online, but never block the UI on that attempt.
- A background sync process (triggered on 'online' browser event, and on a periodic interval as a fallback) flushes unsynced queue rows to their corresponding Server Action, in creation order, marking each as synced on success.
- Conflict handling: last-write-wins at the row level, per ADR-003's explicit trade-off — do not build merge-conflict UI.
- Register a service worker via next-pwa that caches the app shell (JS/CSS/fonts) so the app opens to a usable UI with zero network connectivity, not just a blank screen or browser offline error.
- Add a persistent, always-visible offline/sync-status indicator component (per DESIGN.md Section 3) — small banner or icon showing "Offline — N actions queued" vs "Synced," never buried in a settings menu.

Test explicitly: airplane-mode the device, perform a stock update, bed toggle, and doctor check-in, confirm all three appear correctly in the UI immediately, then restore connectivity and confirm all three sync to Supabase and appear in the respective tables.
```

---

## Phase 6 — Deterministic AI Engine: Forecast & Severity

```
Build the Flagging & Analytics domain module's deterministic layer (/domain/flagging-analytics), per DECISIONS.md ADR-005 — this is Stage 1 and Stage 2 of the AI pipeline in DESIGN.md Section 7. No LLM calls in this phase.

Forecast Engine:
- On every successful stock_logs insert (triggered from Phase 3's Server Action, after DB write confirms), read the last 14 days of stock_logs for that stock_item_id.
- Compute a rolling average daily consumption rate (sum of negative deltas / 14), then projected days-to-zero = current quantity / average daily consumption. Handle division-by-zero (no consumption recorded) by returning null/no-forecast rather than crashing.

Severity Tiering (fixed rule thresholds, per ARCHITECTURE.md Section 8):
- 🔴 critical: days-to-zero <= 3, OR bed_status.occupied == bed_status.total, OR doctor_attendance shows no check-in by a defined cutoff time with no prior notice
- 🟡 warning: days-to-zero <= 7
- 🟢 watch: declining trend but outside the above thresholds

When a threshold is breached:
- Insert a row into flags with the computed severity and category, reason_text_en/hi left null for now.
- Do NOT call any AI/LLM here — that's Phase 8. This insert must succeed and be immediately visible to the admin dashboard even if the AI explanation step later fails.

Apply the same pattern for bed_status and doctor_attendance triggers (bed occupancy at capacity, doctor absence past a cutoff).

Write unit tests for the forecast arithmetic and severity thresholds specifically — these are the numbers a district admin will ask "why does it say critical" about, per ADR-005's auditability requirement, so they need to be independently verifiable, not just eyeballed.
```

---

## Phase 7 — Redistribution Matcher

```
Build the Redistribution domain module (/domain/redistribution), per DECISIONS.md ADR-012.

Logic:
- When a stock item flag is created (from Phase 6) with category='stock', query for other facilities' stock_items rows for the same item_name with quantity above a surplus threshold.
- For each candidate surplus facility, compute Haversine distance using facilities.lat/lng between the deficit and surplus facility. Use the standard Haversine formula — no external routing API or library needed, per ADR-011/012.
- Rank candidates by distance, take the top 1-3 within a configurable radius (e.g., 50km, adjustable), and insert rows into redistribution_suggestions with a computed suggested_qty (e.g., half the surplus facility's excess above its own threshold, capped at the deficit amount).
- This is a suggestion only — status defaults to 'pending'; the admin dashboard (Phase 9) will let an admin mark it 'actioned' or 'dismissed', but the matcher itself never triggers an actual transfer.

Write a test with at least 3 seeded facilities at known coordinates and known stock levels to confirm the distance ranking and quantity suggestion logic produce the expected candidate order.
```

---

## Phase 8 — Generative AI Layer (Gemini via OpenRouter)

```
Build the generative Stage 3 of the AI module (/lib/ai/gemini.ts), per DECISIONS.md ADR-006 and DESIGN.md Section 7. This layer is invoked only AFTER Phase 6/7 have already produced a number and severity/suggestion — never before.

Set up an OpenRouter client using the OPENROUTER_API_KEY env var, targeting a Gemini model (check OpenRouter's current model slug for a free-tier Gemini variant at build time, since exact identifiers change).

Function 1 — Explanation Generator:
Input: { item, facility_name, days_to_zero, severity } or equivalent for bed/doctor/test flags.
Prompt Gemini to output ONE sentence in English and one in Hindi, plain language, e.g. "Stock-out risk: Paracetamol, projected in 3 days based on last 2 weeks usage." Update the flags row's reason_text_en and reason_text_hi fields.
Handle failure gracefully: if the Gemini call errors, times out, or returns malformed output, leave reason_text null and log the failure — the flag itself (with raw numbers and severity) must already be visible on the dashboard regardless, per ADR-005's failure-isolation requirement. Do not let this call block or fail the flag-creation transaction, since it runs after that transaction has already committed.

Function 2 — Voice/Chat Intent Parser:
Input: raw transcript or typed message (may be Hindi, English, or code-switched).
Prompt Gemini to output ONLY a JSON object: { action: "deplete"|"restock", item: string, quantity: number, facility: string, confidence: "high"|"low" }.
Validate the response against a zod schema before it's allowed anywhere near a write path. If validation fails or confidence is "low," do not auto-apply — surface it back to the user for confirmation instead (used in Phase 10).

Function 3 — Patient Chatbot Responder:
Input: a patient's natural-language query + the relevant read-only facility data already fetched from Postgres.
Prompt Gemini to generate a natural, bilingual (matching the query's language) answer grounded only in the provided data — instruct it explicitly not to invent facility names or numbers not present in the input.

All three functions live behind a single interface so a future provider swap (per ADR-006's stated exit path) only touches this file.
```

---

## Phase 9 — Voice Input

```
Build the voice input flow for stock updates, per DESIGN.md Section 6, Flow 2.

- Add a microphone button component (with a clear listening/processing/done visual state, per DESIGN.md's accessibility notes) to the stock update screen from Phase 3.
- On tap, use the Web Speech API (SpeechRecognition, with lang set based on the user's selected language) to capture a spoken utterance and convert to text in-browser.
- Send the transcript to Phase 8's Intent Parser function.
- If the parsed result is high-confidence and schema-valid: apply it through the exact same Server Action + offline-queue path as a typed update (Phase 3/5) — do not create a separate write path for voice-originated updates.
- If low-confidence or invalid: show the parsed guess to the user in plain language ("Did you mean: Paracetamol, out of stock?") with confirm/cancel buttons before writing anything.
- Handle the case where SpeechRecognition isn't supported in the browser (some Android WebViews) by falling back cleanly to the typed input, not a broken button.
```

---

## Phase 10 — District Admin Dashboard

```
Build the district admin dashboard under /(admin), per DESIGN.md Sections 4-6.

Components:
- Flag list: subscribe to Supabase Realtime on the flags table (filtered to the admin's district via a join through facilities), rendering new/updated flags live with no page refresh, per ADR-004.
- Severity badge component: color-coded 🔴/🟡/🟢 per DESIGN.md's visual style guide, always paired with a text label, never color alone.
- Each flag card shows: facility name, category, severity, and reason_text in the admin's selected language (English/Hindi) — if reason_text is still null (Gemini call pending/failed), show the raw computed number instead of a blank space.
- Redistribution suggestion cards: from/to facility, item, quantity, distance, with Actioned/Dismissed buttons that update redistribution_suggestions.status.
- A map view (Leaflet, per ADR-011) plotting all facilities in the district, color-coded by whether they currently have an unresolved flag, with a line overlay for any pending redistribution suggestion between two facilities.

This is the one screen designed tablet/laptop-first per DESIGN.md Section 7 — build the layout accordingly, with a reasonable mobile fallback rather than mobile-first.
```

---

## Phase 11 — Patient Lookup & Chatbot

```
Build the no-login public patient experience under /(public), per DECISIONS.md ADR-008 and DESIGN.md Flow 3.

- A search screen: patient selects or is geo-located to a nearby facility (or searches by name/area), then sees current availability for medicines, beds, and functional tests — read-only queries against stock_items, bed_status, test_availability, with RLS allowing anonymous read access to these specific fields only (not staff/admin tables).
- A chatbot component: patient types or speaks a query (e.g., "Rampur PHC mein paracetamol hai kya"), which is sent to Phase 8's Chatbot Responder function along with the relevant facility data, and displays the bilingual generated answer.
- No auth check anywhere in this route group. No patient identity is collected — if a session identifier is needed for chat continuity, generate an anonymous session token client-side, not tied to any personal data, and log it in chat_logs.patient_session per the schema in Phase 1.
- Confirm this route group is explicitly excluded from the auth middleware built in Phase 2.
```

---

## Phase 12 — SMS Fallback (Twilio Webhook)

```
Build the SMS fallback path, per DECISIONS.md ADR-009. Scope this narrowly — a parser, not a conversation system.

- Create an API route (e.g., /api/sms-webhook) that Twilio can POST to on incoming SMS.
- Parse a fixed-format command, e.g. "STOCK <ITEM_CODE> <QUANTITY_DELTA> <FACILITY_CODE>", using a simple regex/split parser — no NLP needed here, this is intentionally rigid per ADR-009.
- On successful parse, apply the write through the same Resource Monitoring Server Action used elsewhere (Phase 3), with stock_logs.source = 'sms'.
- On parse failure, do nothing destructive — log the malformed message for later review rather than guessing.
- For the hackathon demo, add a mock mode (env flag) that simulates an incoming SMS via a debug UI button instead of requiring a live Twilio number under demo-network conditions, per ADR-009's explicit allowance for this.
```

---

## Phase 13 — Reports (Weekly PDF/CSV)

```
Build the reporting feature, per ARCHITECTURE.md Section 12 (trimmed scope — no report-builder UI).

- Write a scheduled function (Vercel Cron, weekly) that queries the past week's flags, stock_logs summary, attendance summary, and footfall totals per facility for a district.
- Generate a simple PDF (e.g., via a lightweight library like pdf-lib or react-pdf) and a CSV export of the same underlying data.
- Upload both to Supabase Storage under a district/week-dated path.
- On the admin dashboard, add a "This week's report" link that fetches the latest generated file from Storage — no on-demand report configuration UI, just the latest auto-generated artifact.
```

---

## Phase 14 — Internationalization (English/Hindi)

```
Implement the English/Hindi toggle across the entire app, per Design Principle #3 and DESIGN.md Section 8.

- Set up a simple i18n dictionary approach (JSON files per language, or next-intl if the team prefers a library) covering all static UI strings across staff, doctor, admin, and public routes.
- Add a persistent language toggle in the main navigation/header, not buried in a settings page.
- Confirm this is threaded through consistently with the AI-generated bilingual content from Phase 8 — the UI chrome language and the AI explanation language should match what the user has selected, not be independently controlled.
- Test that switching language mid-session doesn't require a full reload or lose any queued offline writes.
```

---

## Phase 15 — Testing & QA Pass

```
Run a structured QA pass across the critical flows before deployment:

1. Offline queue: airplane-mode test for stock/bed/attendance writes (repeat Phase 5's test as a final regression check).
2. RLS boundaries: attempt cross-facility reads/writes as a nurse role via direct Supabase client calls (not just UI), confirm all are rejected.
3. Flag accuracy: seed stock_logs data with a known consumption pattern, confirm the forecast/severity output matches hand-calculated expected values.
4. AI failure isolation: temporarily break the OpenRouter API key, confirm flags still get created with correct severity and just missing reason_text, per ADR-005.
5. Voice intent: test at least 5 varied Hindi/English/code-switched utterances against the Intent Parser, confirm low-confidence cases surface for confirmation rather than silently writing.
6. Patient lookup: confirm zero auth prompts appear anywhere in the (public) route group.
7. SMS mock: confirm the mock-mode demo path works without a live Twilio number.

Log and fix any failures before moving to Phase 16.
```

---

## Phase 16 — Deployment & Demo Prep

```
Deploy Vyas to Vercel, per ARCHITECTURE.md's hosting choice.

- Configure all env vars (Supabase, OpenRouter, Twilio) in Vercel's project settings, not committed to the repo.
- Confirm the PWA installs correctly on an Android device (Add to Home Screen) and opens with zero connectivity, per Phase 5's service worker setup.
- Seed the production/demo database with the 5-facility dataset from Phase 1, plus enough stock_logs history (at least 14 days of synthetic but plausible daily deltas) for at least one item to already be trending toward a critical flag before the live demo starts — do not rely on generating a flag live on stage from a cold start.
- Prepare the demo script matching ARCHITECTURE.md Section 15's flow exactly: (1) pharmacist voice update on simulated bad connection, (2) live flag appears on admin dashboard with Gemini explanation, (3) redistribution suggestion shown, (4) patient lookup with no login, (5) close on the ABDM/HMIS/eSanjeevani comparison slide.
- Do a full dry run on the actual demo device/network conditions, not just localhost, before the judging round.
```
