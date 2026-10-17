# Architectural Decisions - Mediserv

## Decision Log

### ADR-001: Modular Monolith on Next.js (API Routes / Server Actions) Instead of Microservices

**Status:** Accepted

**Context**
Vyas must go from zero to a working, demoable, multi-persona system (nurse, pharmacist, doctor, patient, district admin) inside a hackathon timeline, then survive first real district pilots without a platform rewrite. A "proper hospital SaaS" instinct pulls toward a services-per-domain split (stock service, attendance service, notification service, AI service). That instinct is wrong for this stage: it multiplies deploy surfaces, network failure modes, and debugging time for a team that needs to spend its hours on the offline-sync and AI-explanation logic that actually differentiates the product.

**Decision**
Keep a single Next.js application (App Router) using API Routes and Server Actions as the entire backend. No standalone services, no API gateway, no service mesh.

**Rationale**
- One deployable unit means one thing to break, one thing to roll back, one log stream to read during a live judged demo.
- Server Actions colocate mutation logic with the UI that triggers it (stock update, bed toggle, check-in), which matches the "one tap beats one form" design principle — less plumbing between intent and write.
- District-scale load (a few hundred facilities, a few thousand daily writes) does not justify horizontal service decomposition; the bottleneck at this scale is field connectivity, not backend throughput.
- A monolith is the correct precursor to future extraction: domain boundaries (stock, attendance, flags, AI) are kept as separate modules/folders now specifically so a future service split, if ever needed, is a lift-and-shift rather than a re-architecture.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Microservices (NestJS modules per domain) | Independent scaling, clear ownership boundaries | Multiple deploys, inter-service auth, network calls where a function call would do, far more hackathon time spent on plumbing than product | Team velocity and demo reliability outweigh a scaling need that doesn't exist yet |
| Separate Express/NestJS backend + separate frontend | Clear separation of concerns, backend reusable by future native app | Two deploy targets, CORS/auth duplication, slower iteration | Next.js Server Actions already give type-safe client-to-server calls without a second app |
| BFF (Backend-for-Frontend) pattern | Tailors API shape per client type | Premature for a single PWA client | No second client exists yet; adds a layer with no current consumer |

**Consequences**
- Positive: fastest possible path from design to working demo; single source of truth for routing and auth context; easy to reason about during judging Q&A.
- Negative: all compute scales together; a heavy AI-explanation call sits in the same process as a bed-toggle write.
- Risks & Mitigations: if district-wide rollout later produces real load spikes, the AI-explanation path (already isolated as a module) can be pulled into a queued background job or separate function without touching the data-write paths.

**When to Revisit**
When facility count crosses roughly 500 facilities with concurrent write load, or when a second client (native app, government integration partner) needs a stable public API contract independent of the PWA's UI needs.

---

### ADR-002: Supabase as Unified Backend-as-a-Service (Postgres + Auth + Realtime + Storage)

**Status:** Accepted

**Context**
The original "hospital SaaS template" mental model implies four separate subsystems: a relational database, an identity provider, a pub/sub or WebSocket layer for live dashboards, and object storage for reports. Standing up and operating four subsystems is exactly the kind of work that consumes hackathon time and, later, on-call burden for a small team supporting a public-sector pilot.

**Decision**
Adopt Supabase as the single backend-as-a-service layer: Postgres for all relational data, Supabase Auth for phone/OTP identity, Supabase Realtime for live dashboard updates, Supabase Storage for generated reports, and Row Level Security (RLS) as the authorization layer.

**Rationale**
- Collapses four operational surfaces into one, which is a direct reduction in what can fail during a live demo or a low-connectivity district rollout.
- Postgres gives Vyas real relational integrity (foreign keys between `facilities`, `stock_items`, `flags`) that a looser NoSQL choice would force the application layer to re-implement.
- RLS pushes access control into the database itself rather than scattering `if (user.role === ...)` checks across API routes — this matters specifically because a nurse writing to another facility's stock table is not just a bug, it's a data-integrity incident a district admin would notice and lose trust over.
- Free-tier availability removes cost as a blocker during the pilot phase, which is a real adoption factor for a public-sector tool with no committed budget yet.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Firebase (Firestore + Auth + RTDB) | Similarly unified, mature realtime | Document model fights the genuinely relational nature of facility/stock/flag data; weaker Indian phone-OTP ergonomics | Postgres's relational guarantees matter for redistribution matching (joins across facilities and stock) |
| Self-hosted Postgres + custom Auth + Redis pub/sub + S3 | Full control, no vendor lock-in | Four systems to provision, secure, and keep online; direct contradiction of the "don't rebuild what already exists" principle applied to infrastructure itself | Operational cost has no payoff at this scale and this team size |
| MongoDB Atlas + separate auth provider | Flexible schema | Loses relational integrity for a genuinely relational domain (facility ↔ stock ↔ flag ↔ redistribution) | Data model is inherently relational; forcing it into documents adds application-layer join logic for no benefit |

**Consequences**
- Positive: minimal infrastructure surface area; RLS gives compliance-relevant access guarantees "for free."
- Negative: vendor coupling to Supabase's specific Postgres extensions and Realtime implementation.
- Risks & Mitigations: because it's still standard Postgres underneath, a future migration to self-hosted Postgres (e.g., under a government data-residency requirement) is a database dump/restore, not a rewrite — this was a deliberate condition of choosing Supabase over a more proprietary BaaS.

**When to Revisit**
If a government data-residency mandate requires on-premise or India-region-only hosting that Supabase's plan tier cannot satisfy, or if free-tier row/connection limits are hit by multi-district scale.

---

### ADR-003: Offline-First via IndexedDB Write Queue + Service Worker, Not "Offline-Tolerant" Caching

**Status:** Accepted

**Context**
This is the single most consequential decision in the system. PHC/CHC staff work with zero or intermittent signal as the *normal* condition, not an edge case. Most field health-data tools fail in exactly this gap: they render a blank screen or a spinner the moment signal drops, so staff quietly revert to the paper register — which is the entire problem Vyas exists to solve.

**Decision**
Every write action (stock update, bed toggle, attendance check-in/out) is written to an IndexedDB queue first, with optimistic UI update, and synced to Supabase only when connectivity returns. A service worker caches the app shell so the app opens with zero signal at all.

**Rationale**
- "Offline-tolerant" (retry-on-failure) still requires the request to be attempted live; "offline-first" (queue-then-sync) means the nurse's five-second interaction never waits on a network round-trip, full stop.
- Optimistic UI update is what makes the one-tap interaction feel instant regardless of signal, which is a hard requirement from Design Principle #2, not a nice-to-have.
- Last-write-wins conflict resolution is an explicit, accepted trade-off: at this data granularity (a stock count, a bed toggle), the cost of occasional overwrite is far lower than the cost of a merge-conflict UI that field staff would never resolve correctly.
- This is explicitly the hardest feature to implement correctly and the one most hackathon competitors will skip — it is treated as core scope, not a stretch goal, because it is the actual reason government field-data tools fail today.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Simple retry-on-failure (no local queue) | Much simpler to build | App is unusable with zero signal, which is the actual field condition | Directly violates Design Principle #1; solves nothing over the paper register it replaces |
| CRDT-based conflict-free sync | Mathematically clean conflict resolution | Significant implementation complexity for a payload that's mostly simple counters | Complexity not justified by the data's low conflict sensitivity |
| Native mobile app with platform-level offline support | Stronger offline primitives (SQLite, background sync) | Two app stores, install friction, slower iteration, contradicts "installable PWA on Android home screen" adoption strategy | PWA + Service Worker gives 90% of the offline benefit with a single deployable and zero install friction |

**Consequences**
- Positive: the app is genuinely usable in the exact conditions PHC/CHC staff work in; this is the strongest adoption lever in the whole system.
- Negative: last-write-wins can silently drop a concurrent update from a second device on the same facility (rare, but possible during shift handover).
- Risks & Mitigations: `stock_logs` retains every delta as an append-only log (not just the latest count), so even if `stock_items.quantity` is overwritten, the audit trail of what happened is not lost — this is a deliberate mitigation, not an oversight.

**When to Revisit**
If concurrent multi-device editing per facility becomes common (e.g., a shift-change scenario where two pharmacists update stock within seconds of each other on different devices), revisit toward a queue-ordered merge rather than last-write-wins.

---

### ADR-004: Supabase Realtime Instead of a Custom WebSocket Layer

**Status:** Accepted

**Decision**
District admin dashboards subscribe to Supabase Realtime channels on the `flags` table; no custom WebSocket server, no polling loop.

**Context**
The district admin's core need — see a flagged centre the moment it's flagged, not in next week's paper report — is fundamentally a push problem. Building and operating a WebSocket server (connection management, reconnection, horizontal scaling of socket state) is exactly the kind of "hospital SaaS template" infrastructure this build explicitly rejects when a managed alternative exists.

**Rationale**
- Realtime is a direct subscription on top of the same Postgres tables already being written to — no separate event bus, no dual-write consistency problem between "the data" and "the event that data changed."
- It collapses what would otherwise be a fourth infrastructure subsystem (per ADR-002's broader unification argument) into a checkbox on a Supabase table.
- The demo flow itself depends on this: a flag appearing live on the district dashboard within the same minute a pharmacist logs a stock-out, on stage, is only credible with a genuinely real-time push mechanism.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Client polling every N seconds | Trivial to implement | Not truly real-time, wastes requests on mostly-empty polls, feels laggy in a demo | Directly undercuts the "real-time" claim that's central to the pitch |
| Custom WebSocket server (Socket.IO on a Node process) | Full control over event shape | A subsystem to deploy, scale, and keep alive independently of the main app | Exactly the infrastructure sprawl ADR-002 rejects |
| Server-Sent Events (SSE) from a Next.js route | Simpler than WebSockets, no extra infra | Still requires building and maintaining a custom event-broadcast layer on top of Postgres changes | Supabase Realtime already does this, with less code |

**Consequences**
- Positive: live dashboard behavior with effectively zero custom real-time code.
- Negative: realtime subscriptions are scoped to what Supabase's product supports; less flexibility than a hand-rolled event system.
- Risks & Mitigations: none significant at district scale; Supabase Realtime is proven at far higher connection counts than this deployment will reach.

**When to Revisit**
If Vyas needs cross-district or national-scale realtime fan-out with custom event routing logic beyond table-change subscriptions.

---

### ADR-005: Deterministic Arithmetic for Forecasting; LLM Used Only for Explanation, Not Prediction

**Status:** Accepted

**Context**
"AI-powered healthcare platform" invites a reflex toward a trained ML forecasting model. For a hackathon build with no historical dataset to train on, and for a domain where a wrong stock-out prediction has a real consequence (a patient turned away, or a district admin who stops trusting the flag), an opaque model that can't explain itself is a liability, not a feature.

**Decision**
Stock-out prediction is a rolling 14-day average of consumption from `stock_logs`, projected to days-to-zero — plain arithmetic. Redistribution matching is a threshold-and-distance rule (Haversine, no routing engine). Severity tiering is a fixed rule set (🔴/🟡/🟢 against explicit day/occupancy thresholds). The LLM (Gemini) is invoked *after* these numbers exist, solely to translate them into a one-line English + Hindi explanation.

**Rationale**
- Patient-safety-adjacent, healthcare-domain-facing numbers must be auditable — an admin can ask "why does it say 3 days" and get a straight arithmetic answer, not "the model decided."
- No training data exists yet; a "trained model" at this stage would either be a toy overfit to synthetic data or a thin wrapper pretending to be more than arithmetic. Being explicit that this is arithmetic, not fake ML, is itself a credibility decision for a judged and later a government-evaluated system.
- This cleanly separates two concerns that should never share a failure mode: the LLM being down, rate-limited, or hallucinating must never affect whether a flag is correctly raised — only how nicely it's explained. If Gemini fails, the number and the severity tier still exist and still page the district admin.
- It matches Design Principle #4 exactly: "AI explains, it doesn't just chart" — the explanation layer is the AI's actual job, not prediction it isn't trained to do reliably yet.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Trained time-series model (e.g., Prophet, LSTM) per item/facility | Potentially more accurate at scale with enough history | No training data exists yet; opaque reasoning in a domain needing auditability; massive overkill for hackathon timeline | Premature complexity with no data to justify it |
| LLM directly computes the forecast from raw logs (no arithmetic layer) | Fewer lines of code | Non-deterministic, unverifiable numbers in a patient-safety-adjacent context; a hallucinated "5 days" is indistinguishable from a correct one | Unacceptable to have an unverifiable number driving a critical-severity flag |
| No forecasting, threshold-only on current stock count | Simplest possible | Loses all early-warning value — the entire point of the product is *early*, not "stock is already at zero" | Defeats the core problem statement in Section 1 |

**Consequences**
- Positive: every flag is explainable, auditable, and independent of LLM availability for its correctness.
- Negative: rolling-average forecasting is naive — it won't catch seasonal or event-driven demand spikes (e.g., an outbreak).
- Risks & Mitigations: `stock_logs` already captures the raw time series needed to later layer in a proper trained model without any schema change — the arithmetic-now approach doesn't foreclose ML-later, it defers it until real data justifies it.

**When to Revisit**
Once 3–6 months of real multi-facility `stock_logs` data exists, revisit toward a proper seasonal/trend model, keeping the LLM's role unchanged (explanation only).

---

### ADR-006: Gemini via OpenRouter (Free Tier) as the LLM Provider

**Status:** Accepted

**Decision**
Use Gemini, accessed through OpenRouter's free tier, for all generative tasks: flag explanations (English + Hindi), the citizen-facing chatbot, and voice-intent JSON extraction.

**Context**
The generative tasks in this system are narrow and well-specified (turn structured numbers into one sentence; extract `{action, item, quantity, facility}` from a Hindi/English utterance) — they do not need a frontier-scale proprietary model with a per-token cost that a hackathon or early pilot can't absorb.

**Rationale**
- Zero cost during the phase that matters most (build, demo, first pilot) removes budget as an adoption blocker for a public-sector tool.
- Gemini's multilingual capability, specifically Hindi, is load-bearing here — this isn't a "nice to have" language toggle, it's the literal example given in the brief ("Paracetamol khatam").
- Routing through OpenRouter rather than calling Gemini's API directly keeps a provider-swap option open (cost, rate limit, or quality reasons) behind one interface, without redesigning the AI module.
- The tasks asked of the model — templated sentence generation and structured JSON extraction from short utterances — are well within a free-tier model's reliable capability range; this is not a task that needs top-tier reasoning.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| OpenAI GPT-4o/4o-mini | Strong general quality | Paid, and no meaningful quality edge for templated one-line explanations | Cost with no corresponding benefit for this narrow task |
| Self-hosted open-weight model (e.g., Llama) | No per-request cost, full control | Requires hosting infra and GPU access — the exact infra sprawl this build avoids everywhere else | Contradicts the "no infra we don't need" thread running through every other decision |
| Rule-based templating (no LLM at all) | Zero dependency, fully deterministic | Can't naturally handle open-ended voice/chat input in mixed Hindi-English (code-switching), which is how people actually speak | Fails Design Principle #3 (voice/regional language as first-class input) |

**Consequences**
- Positive: zero marginal cost during pilot phase; multilingual explanation and chat "for free" relative to build effort.
- Negative: free-tier rate limits and availability are outside Vyas's control; not suitable as-is for a paid, SLA-backed production deployment.
- Risks & Mitigations: because forecasting/flagging logic never depends on the LLM (ADR-005), a Gemini outage degrades explanation quality, not system correctness — flags still fire with raw numbers even if the friendly sentence fails to generate.

**When to Revisit**
Before any paid/SLA-backed government deployment, revisit provider choice against uptime guarantees and volume-based pricing, not just free-tier availability.

---

### ADR-007: Phone/OTP Auth + Row Level Security Instead of Google OAuth + Application-Layer Access Control

**Status:** Accepted

**Context**
Most SaaS templates default to Google OAuth because it's the fastest to wire up for a developer audience. PHC/CHC staff are not that audience — most will not have, or want to manage, a workflow Gmail account. Designing auth around a convenience assumption that doesn't hold for the actual user base would kill adoption before day one.

**Decision**
Staff authenticate via phone number + OTP through Supabase Auth. Authorization is enforced via Postgres Row Level Security: nurses/pharmacists can write only their own facility's rows; district admins get read access across their district. Patients get no login at all for lookup/chatbot.

**Rationale**
- Phone number is the one credential every persona in Section 3 already has and already uses daily — it matches the user, not developer convenience.
- RLS enforcing "your facility's data only" at the database layer means a bug in a single API route can't accidentally leak or corrupt another facility's stock counts — the access boundary holds even if application code has a mistake.
- This is a compliance-relevant control, not just a security nicety: in a healthcare-adjacent system, provable data-access boundaries per role are the kind of thing a district health department or auditor will explicitly ask to see.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Google OAuth | Fast to implement, familiar to developers | Assumes an email-centric workflow most PHC/CHC staff don't have | Wrong fit for the actual user base, not the developer building it |
| Application-layer role checks only (no RLS) | Simpler mental model, all logic in one place | A single missed check in one API route is a real data-leak/corruption incident | Database-enforced boundary is strictly safer for facility-scoped health-adjacent data |
| Username/password | No third-party dependency | Password reset/management friction for low-literacy or first-time digital users | OTP removes a category of support burden and forgotten-password failure entirely |

**Consequences**
- Positive: auth matches actual user capability; access boundaries are enforced at the data layer, not just the UI.
- Negative: SMS/OTP delivery reliability in low-connectivity districts is itself a dependency (mitigated by the SMS-fallback design in ADR-009 for data entry, though not for login itself).
- Risks & Mitigations: Supabase Auth's phone provider requires a configured SMS sender; for pilot districts with historically poor SMS delivery, a fallback like a facility-issued PIN could be layered in without changing the RLS model.

**When to Revisit**
If OTP delivery reliability proves to be a genuine adoption blocker in a specific district's telecom conditions.

---

### ADR-008: No-Login Public Patient Lookup — A Deliberate Adoption Decision, Not a Scope Cut

**Status:** Accepted

**Context**
It would be easy to justify requiring patient accounts "for future features" (history, notifications, EHR tie-in later). That instinct optimizes for a roadmap the product doesn't have yet, at the direct cost of the one interaction patients actually need today: "is X available at the nearest PHC right now."

**Decision**
The patient-facing lookup and chatbot require zero authentication. No citizen accounts exist in v1.

**Rationale**
- Every login field is measurable drop-off for a citizen standing outside a PHC on a bad connection deciding whether the trip is worth it — friction here isn't a UX nicety, it's the difference between the feature being used or not.
- This is explicitly called out as a *decision*, not an oversight or missing feature, because the natural SaaS instinct is the opposite; naming it protects it from being "fixed" later by someone applying a generic template.
- No patient identity is collected at all in v1, which — combined with ADR-007's RLS boundaries — keeps the compliance surface area for personally identifiable patient health data at effectively zero for the current scope (see DESIGN.md §9 for the fuller regulatory reasoning).

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Optional citizen accounts | Enables future personalization, saved searches | Adds friction to the one moment that matters (fast lookup), for a benefit no current persona asked for | Section 3's patient need is "look up now," not "save preferences" |
| Mandatory citizen accounts (future EHR tie-in) | Cleaner path to a future patient-history feature | Kills usage of the core lookup feature immediately; EHR/history is explicitly out of scope (Section 6) and duplicates ABDM's role | Directly contradicts Section 6's dropped-scope list and Section 13's ABDM positioning |

**Consequences**
- Positive: zero-friction adoption for the highest-volume, lowest-effort persona interaction in the system.
- Negative: no way to notify a specific patient proactively (e.g., "medicine is back in stock") without an account.
- Risks & Mitigations: none material at this scope; proactive notification is explicitly a roadmap item, not a current gap.

**When to Revisit**
If/when Vyas scope expands toward patient-specific notifications or ABDM-linked citizen accounts (see DESIGN.md §10 roadmap) — and even then, lookup should remain login-free.

---

### ADR-009: SMS Fallback as a Parsed Webhook, Not a Full Telco Integration

**Status:** Accepted

**Decision**
A staff member can text a fixed-format code (e.g., `STOCK PCM 0 RAMPUR`) to a number; a Twilio webhook parses it and writes to `stock_logs`. For demo purposes this can be mocked rather than requiring a live Twilio production number.

**Context**
Some PHC/CHC locations will have zero data connectivity but working basic SMS — a condition the PWA's offline queue doesn't address, since it still requires the device to eventually reconnect to data. Ignoring this case would mean claiming "works in zero signal" while quietly requiring data signal to ever sync.

**Rationale**
- A fixed-format command is trivially parseable and matches how low-bandwidth government reporting already works in the field (structured SMS codes are a familiar pattern, not a novel UX to learn).
- Building this as a thin webhook parser, rather than a full two-way SMS conversation system, keeps scope proportionate to the actual need: one-way structured data entry, not an SMS chatbot.
- Explicitly allowing this to be mocked for the demo (rather than requiring a live Twilio trial number under demo-network conditions) is a deliberate scope decision: the judged criterion is *design awareness* of the zero-connectivity case, not a production telecom integration.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| USSD-based entry | Works on any phone, no smartphone needed | Requires telco-level USSD gateway integration, far beyond hackathon/pilot reach | Infra cost disproportionate to current pilot scale |
| Ignore SMS fallback entirely | Simpler build | Leaves a real zero-signal gap unaddressed, undercutting the offline-first claim | Section 2's Principle #1 explicitly demands zero-signal usability |
| Two-way SMS chatbot | More flexible input | Significant added parsing/state complexity for marginal benefit over fixed-format codes | Fixed-format is sufficient for the narrow set of write actions needed |

**Consequences**
- Positive: closes the true zero-data-signal gap that the IndexedDB queue alone cannot.
- Negative: fixed-format commands are unforgiving of typos; Twilio trial accounts have real limitations outside a controlled demo.
- Risks & Mitigations: this is explicitly scoped as roadmap-hardening, not v1 must-have (see Section 14); a production rollout would need format-tolerant parsing and a paid Twilio number.

**When to Revisit**
Before any district pilot in an area with confirmed zero-data/SMS-only coverage — at that point this moves from "mocked demo feature" to "must actually work."

---

### ADR-010: Flat, Binary Data Models Instead of Granular Healthcare-Standard Schemas

**Status:** Accepted

**Context**
A "proper" healthcare data model reflex reaches for ICU/NICU/ventilator bed sub-types, categorized equipment taxonomies (CT/MRI/ECG), and a full patient/EHR entity. PHCs and CHCs — the actual deployment target — mostly don't have these sub-categories of infrastructure at all, and Vyas explicitly isn't an EHR (that's ABDM's and the hospital-EHR ecosystem's job, per Section 13).

**Decision**
Bed availability is `total / occupied / available`, no sub-types. Test/equipment availability is a binary `is_functional: Y/N` per test type, not a hardcoded taxonomy. No patient/EHR entity exists at all — only an anonymous `footfall_logs` counter.

**Rationale**
- Modeling infrastructure a PHC doesn't have is not neutral extra flexibility — it's UI and data-entry burden imposed on every nurse, every day, for fields that will sit permanently empty at most facilities.
- The binary functional/non-functional model for test equipment answers the one question a patient or admin actually has ("can I get this test done here today"), without requiring the app to maintain a taxonomy of every possible diagnostic machine.
- Explicitly not building a patient/EHR entity is a domain-boundary decision, not a missing feature: it keeps Vyas a resource/operations layer that can sit *on top of* ABDM's registry rather than duplicating or competing with the EHR/health-ID ecosystem the government already runs (Section 13).
- Simpler schemas here directly reduce the compliance surface area for sensitive personal health data — there is no patient-identifiable medical record in this system to protect, because there is no patient-identifiable medical record in this system, full stop.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Full bed taxonomy (ICU/NICU/ventilator/general) | More granular for facilities that do have these | Most PHC/CHC facilities don't have them; empty fields everywhere for no benefit | Doesn't match the actual deployment target's infrastructure |
| Hardcoded equipment categories (CT/MRI/ECG/...) | Structured, filterable by type | New equipment types require a schema change; most PHCs don't have any of these anyway | Binary functional/non-functional answers the real question with a schema that never needs to change |
| Full patient/EHR entity | Enables future clinical features | Massive compliance surface, duplicates ABDM/EHR ecosystem scope, explicitly out of scope per Section 6 | Directly contradicts the "don't rebuild what govt already runs" principle |

**Consequences**
- Positive: minimal data-entry burden matching real facility capability; near-zero patient-PII compliance surface; schema that fits CHCs too where sub-types would apply, without forcing PHCs to fill them in.
- Negative: if Vyas later needs to serve larger CHCs/district hospitals with genuine ICU/ventilator tracking, the flat model will need extension.
- Risks & Mitigations: `test_availability` and `bed_status` are both structured so that adding an optional sub-type field later (nullable, CHC-only) is additive, not a breaking migration.

**When to Revisit**
When Vyas's scope explicitly extends to district hospitals or CHCs with genuine ICU/NICU/specialized-equipment infrastructure worth tracking separately.

---

### ADR-011: OpenStreetMap + Leaflet Instead of Google Maps Platform

**Status:** Accepted

**Decision**
All mapping (facility locations, redistribution distance visualization) uses OpenStreetMap tiles via Leaflet.

**Rationale**
- Zero API key friction and zero cost matter directly for a public-sector tool with no committed budget and a live-demo context where a misconfigured or rate-limited Google Maps key is a real failure mode judges have seen kill demos before.
- District-scale facility mapping (a few hundred points, straight-line distance visualization) needs none of Google Maps' advanced routing/traffic features — Haversine distance (ADR-012) plus basic tile rendering is the entire requirement.
- OSM data quality for rural/district-level India is generally sufficient for facility-location plotting, which is the actual use case (not turn-by-turn navigation).

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Google Maps Platform | Richer data, familiar UI | Requires billing-enabled API key, cost risk at scale, key-management friction for a hackathon/pilot | No feature actually needed (routing, traffic, Street View) justifies the cost/friction |
| Mapbox | Good developer experience | Still a paid/keyed service beyond generous free tier | Same friction category as Google Maps for no needed benefit over free OSM |

**Consequences**
- Positive: zero cost, zero key-management risk, one less thing to break during a demo.
- Negative: less polished default styling than Google Maps; no built-in routing/traffic data if that's ever needed.
- Risks & Mitigations: none material — redistribution suggestions need proximity, not routing (ADR-012 covers this explicitly).

**When to Revisit**
If a future feature genuinely needs turn-by-turn routing (e.g., an ambulance/SOS routing feature, explicitly listed as roadmap-only in Section 6).

---

### ADR-012: Haversine-Distance Redistribution Matching Instead of a Routing Engine

**Status:** Accepted

**Decision**
Redistribution suggestions use straight-line (Haversine) distance between facility lat/lng pairs and a surplus/deficit threshold rule — no routing engine, no road-network graph.

**Rationale**
- The redistribution question is "which nearby facility has surplus of the same item," which is a proximity ranking problem, not a "what's the fastest driving route" problem — a routing engine solves a question nobody asked here.
- Haversine distance is pure arithmetic against data already in the `facilities` table (lat/lng); it introduces zero new infrastructure or third-party dependency, consistent with the "arithmetic where arithmetic suffices" thread running through ADR-005.
- District admins making the actual transfer decision will apply their own real-world road knowledge; the app's job is to surface *candidates* ranked by proximity, not to prescribe a route.

**Alternatives Considered**
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Routing engine (OSRM/Google Directions) with actual road distance/time | More realistic transfer-time estimate | Extra infra (OSRM) or paid API (Directions), for a precision gain not needed to just rank candidate facilities | Disproportionate complexity for a ranking, not routing, problem |
| No distance calculation, list all facilities with surplus | Simplest possible | Useless for a district admin comparing a 3km option against a 40km option | Fails the actual redistribution decision-support need |

**Consequences**
- Positive: zero added infrastructure; fast, deterministic, explainable suggestion ranking.
- Negative: straight-line distance can understate real travel time/distance where road networks are indirect (rivers, hills, one-way district roads).
- Risks & Mitigations: this is an accepted approximation for a *suggestion*, not an automated transfer — a human admin makes the final call with local road knowledge the system doesn't need to encode.

**When to Revisit**
If Vyas ever automates transfer logistics (rather than suggesting candidates to a human admin), or if the future ambulance/SOS routing roadmap item is built and a routing engine is introduced for that purpose anyway.

---
