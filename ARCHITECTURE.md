# Vyas — District PHC/CHC Resource & Early-Warning Platform
### Architecture v2 — Hackathon Build

---

## 1. The Problem, Restated in One Line

PHCs/CHCs run on tribal knowledge and phone calls. Stock-outs, empty beds nobody knows about, doctors who don't show up, and broken test machines all get discovered *after* a patient is turned away — never before. Vyas's only job is to surface these problems early enough for someone to act, in a form that works on a bad phone with a worse signal.

Everything below is filtered through one test: **does this help a nurse, a pharmacist, a doctor, a patient, or a district admin do their actual job today — or is it there because hospital SaaS templates usually have it?**

---

## 2. Design Principles

1. **Offline-first, not offline-tolerant.** The app must be fully usable with zero signal. Sync is a background concern, not a blocker.
2. **One tap beats one form.** Every core action (attendance, stock update, bed count) should be doable in under 5 seconds.
3. **Voice and regional language are inputs, not features.** A pharmacist saying "Paracetamol khatam" in Hindi is a first-class interaction, not an accessibility add-on.
4. **AI explains, it doesn't just chart.** Every number the district admin sees should come with a one-line "why" and a suggested action.
5. **No persona gets left behind.** If a screen only serves one type of user well, it's incomplete.
6. **Don't rebuild what govt already runs.** Position against ABDM/HMIS/eSanjeevani, don't duplicate their scope (EHRs, teleconsultation).

---

## 3. Personas & What They Actually Need

| Persona | Real pain today | What Vyas gives them |
|---|---|---|
| **ANM / Staff Nurse** | Manually tracks footfall and beds on paper registers | One-tap patient-in counter, one-tap bed occupied/free toggle |
| **Pharmacist / Storekeeper** | No visibility into stock trend; discovers stock-out when a patient asks | Voice/typed stock update, sees own centre's stock-out risk instantly |
| **Doctor / Medical Officer** | Attendance tracked on paper, disputed later | Geo-tagged check-in/check-out, visible to admin in real time |
| **Patient / Citizen** | Travels to a PHC, finds no medicine/doctor/bed, wasted trip | Simple "is X available at nearest PHC right now" lookup — no login needed |
| **District Health Admin** | Sees problems weeks later via paper reports | Live flagged-centre dashboard with AI-generated reason + redistribution suggestion |
| **The System (AI layer)** | — | Turns raw logs into forecasts, flags, and plain-language explanations in English + Hindi |

---

## 4. High-Level Architecture

```
                              ┌─────────────────────────────┐
                              │   Patient (no login, web)    │
                              │  "Is Paracetamol available   │
                              │   at PHC Rampur right now?"  │
                              └───────────────┬───────────────┘
                                              │
┌─────────────────────────────────────────────┼─────────────────────────────────────────────┐
│                                   Next.js PWA (single app)                                  │
│   Installable · Offline-first (Service Worker + IndexedDB queue) · Hindi/English toggle     │
│                                                                                               │
│   ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐                    │
│   │  Staff Data-Entry  │   │  Doctor Attendance │   │  District Admin   │                    │
│   │  (nurse/pharmacist)│   │  Check-in/out      │   │  Dashboard         │                    │
│   └─────────┬──────────┘   └─────────┬──────────┘   └─────────┬──────────┘                    │
└─────────────┼────────────────────────┼────────────────────────┼──────────────────────────────┘
              │                        │                        │
              └────────────┬───────────┴────────────┬───────────┘
                            │   (queues locally when offline, syncs on reconnect)
                            ▼
                 ┌─────────────────────────┐
                 │   Supabase (BaaS)        │
                 │  • Postgres (all data)   │
                 │  • Auth (phone/OTP)      │
                 │  • Realtime subscriptions│
                 │  • Storage (reports)     │
                 └────────────┬─────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼                               ▼
   ┌─────────────────────┐         ┌─────────────────────────┐
   │  AI Engine (server)  │         │  SMS Fallback Webhook   │
   │  • trend/threshold   │◄────────┤  (Twilio trial) — parses │
   │    stock-out logic   │         │  "STOCK PCM 0 RAMPUR"   │
   │  • redistribution    │         └─────────────────────────┘
   │    matcher           │
   │  • severity tiering  │
   │  • Gemini (via        │
   │    OpenRouter free)  │──── generates plain-language flag reasons,
   │    for explanations  │     chatbot replies, voice-intent parsing
   │    + Hindi chatbot    │
   └─────────────────────┘
```

No separate microservices, no Redis, no custom WebSocket layer, no NestJS module sprawl for v1. Supabase realtime replaces the custom real-time layer; Postgres replaces Redis + object storage.

---

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) + Tailwind, PWA via `next-pwa` | One deployable app, installable on Android home screen, easy to demo |
| Offline queue | IndexedDB (via `idb` or Dexie.js) + Service Worker | Staff can work with zero signal; syncs on reconnect |
| Backend | Next.js API routes / Server Actions | No separate backend to deploy or debug live |
| Database + Auth + Realtime + Storage | **Supabase** (free tier) | Kills 4 subsystems from the original diagram in one service |
| AI | **Gemini (free tier via OpenRouter)** | Free, good enough for explanation-generation and Hindi chat; no need for a trained ML model |
| Maps | OpenStreetMap + Leaflet | Free, no API key friction for a district-scale map |
| SMS fallback | Twilio trial (or mocked for demo) | Shows rural-connectivity awareness without needing a real telco contract |
| Voice input | Web Speech API (browser) → Gemini for intent parsing | Native browser support, zero extra infra |
| Hosting | Vercel | Free tier, instant deploy, good for live demo |

---

## 6. Core Modules (Trimmed to What the Brief Actually Asks For)

- **Stock Monitoring** — medicines only for v1 (blood/oxygen only if district scope requires it). Simple item, quantity, last-updated.
- **Patient Footfall** — a counter per centre per day, not a Patient/EHR service.
- **Bed Availability** — flat `total / occupied / available`, no ICU/NICU/ventilator sub-types (PHCs/CHCs mostly don't have these).
- **Doctor Attendance** — geo-tagged check-in/check-out, not a scheduling/booking engine.
- **Test/Equipment Availability Audit** — binary "functional today: Y/N" per test type, not hardcoded CT/MRI/ECG categories.
- **AI Analytics** — stock-out warnings, demand forecast, redistribution suggestions, auto-flagging. This is the core of the build.
- **Multilingual Chatbot + Voice Input** — English/Hindi, explicitly in the brief.
- **District Admin Dashboard** — flagged centres, severity, redistribution actions, reports.
- **Patient Lookup** — no-login public search: "does centre X have medicine/bed/doctor today."
- **Reports** — one-click weekly PDF/CSV, auto-generated, not a report builder.

Dropped entirely for hackathon scope (documented as "future roadmap" only): SOS/ambulance routing, appointment booking, patient EHR/medical history, Google OAuth, citizen accounts.

---

## 7. Data Model (Postgres via Supabase)

| Table | Key columns |
|---|---|
| `facilities` | id, name, type (PHC/CHC), district, block, lat, lng, ABDM facility ID (if available) |
| `staff` | id, facility_id, role (nurse/pharmacist/doctor/admin), phone, name |
| `stock_items` | id, facility_id, item_name, quantity, unit, updated_at, updated_by |
| `stock_logs` | id, stock_item_id, delta, source (app/voice/sms), timestamp — used for trend calculation |
| `bed_status` | facility_id, total, occupied, updated_at |
| `doctor_attendance` | id, staff_id, facility_id, check_in, check_out, geo_lat, geo_lng |
| `test_availability` | id, facility_id, test_name, is_functional, updated_at |
| `footfall_logs` | id, facility_id, date, count |
| `flags` | id, facility_id, category (stock/bed/doctor/test), severity (critical/warning/watch), reason_text, created_at, resolved boolean |
| `redistribution_suggestions` | id, item_name, from_facility_id, to_facility_id, suggested_qty, distance_km, status |
| `chat_logs` | id, facility_id or patient_session, language, message, response |

---

## 8. AI Engine — How It Actually Works (No Fake ML)

**Stock-out prediction:** rolling average of daily consumption from `stock_logs` over the last 14 days → projected days-to-zero. No trained model needed — it's arithmetic. Gemini is only used *after* the number exists, to turn it into a sentence and a severity tier.

**Redistribution matching:** simple rule — if Facility A is below threshold and Facility B (within N km, from `facilities` lat/lng) has surplus of the same item, propose a transfer. Haversine distance, no routing engine required.

**Auto-flagging severity tiers:**
- 🔴 Critical — stock-out projected within 3 days, or bed occupancy 100%, or doctor absent unexplained
- 🟡 Warning — stock-out projected within 7 days, or repeated short-staffing
- 🟢 Watch — trending down but not urgent

**Explanation generation:** feed Gemini the structured numbers (item, days-to-zero, facility name) and ask for a one-line English + Hindi explanation. This is what makes the dashboard readable to a district admin in 3 seconds instead of a chart they have to interpret.

**Voice/chat intent parsing:** browser captures speech → text → sent to Gemini with a strict prompt to extract `{action, item, quantity, facility}` as JSON → app applies the update. Same pipeline handles the citizen-facing Hindi/English chatbot for lookups like "Rampur PHC mein paracetamol hai kya."

---

## 9. Offline-First Strategy

- Service worker caches the app shell so it opens with zero signal.
- All write actions (stock update, attendance, bed toggle) go into an IndexedDB queue first, UI updates optimistically.
- A background sync process pushes queued actions to Supabase when connectivity returns, with simple last-write-wins conflict handling (acceptable at this data granularity).
- This single feature is arguably the strongest differentiator in the whole build — it's the actual reason government data tools fail in the field, and almost no hackathon team will bother implementing it properly.

---

## 10. SMS Fallback (for zero-connectivity days)

A staff member texts a fixed-format code (`STOCK PCM 0 RAMPUR`) to a Twilio number → webhook parses and writes to `stock_logs`. For the demo, this can be simulated with a mocked webhook call if a real Twilio trial number is impractical — the point being demonstrated is the design awareness, not a production SMS gateway.

---

## 11. Auth & Roles

- Staff: phone number + OTP via Supabase Auth. No Google OAuth — most PHC staff won't have a workflow Gmail account.
- Roles enforced via Supabase Row Level Security: nurse/pharmacist can only write their own facility's data; district admin has read access across the district.
- Patients: no login required for the lookup/chatbot — this is a deliberate adoption decision, not a scope cut. Login friction kills citizen usage.

---

## 12. Realtime & Reports

- Supabase Realtime subscriptions push live updates to the admin dashboard when a flag is created — no custom WebSocket server needed.
- Reports: one weekly auto-generated PDF/CSV per district, triggered on a schedule, not an on-demand report builder.

---

## 13. Positioning Against What Already Exists (Judges Will Ask This)

| Existing system | Gap Vyas fills |
|---|---|
| HMIS | Not real-time, not AI-driven, heavy reporting-only tool |
| eSanjeevani | Teleconsultation-focused, not resource/stock/attendance monitoring |
| IHIP | Disease surveillance, not day-to-day operational resource tracking |
| ABDM | Federated health ID/registry layer — Vyas can *sit on top of* ABDM's facility registry rather than compete with it |

Have one pitch slide making this comparison explicit — it preempts the "why not just use what exists" question before a judge asks it.

---

## 14. Hackathon MVP Scope

**Must-have (build first, in this order):**
1. Facility + staff seed data, phone/OTP auth
2. Stock update (typed) + bed toggle + doctor check-in/out — the raw data sources
3. Stock-out threshold calculation + severity tiering
4. District admin dashboard with live flags (Supabase Realtime)
5. Gemini-generated one-line explanations for flags
6. Redistribution suggestion matcher
7. Patient no-login lookup page

**Should-have (if time permits):**
8. Voice input for stock updates (Hindi)
9. Multilingual chatbot for patient lookup
10. Offline queue + service worker sync
11. Weekly auto-report (PDF/CSV)

**Stretch / roadmap-only (mention, don't build):**
- SMS fallback (can be mocked live instead of built)
- ABDM registry integration
- Citizen accounts / health records
- Ambulance/SOS routing

---

## 15. Demo Flow (What Judges Should See, in Order)

1. Pharmacist speaks a stock update in Hindi on a simulated bad connection → queues offline → syncs.
2. Cut to district dashboard — a red flag appears live via Supabase Realtime, with a Gemini-generated one-line reason.
3. Show the redistribution suggestion between two nearby centres.
4. Show the patient-side lookup answering "is medicine available" with no login.
5. Close on the ABDM/HMIS/eSanjeevani comparison slide.

This sequence demonstrates every judging criterion — multilingual, real-time, AI-driven, offline-aware, and all five personas — in under a minute.
