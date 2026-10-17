# UI&UX.md — Vyas Design System

## 0. Read This First

The requested visual language — dark OLED neon, intense glassmorphism, cursor-tracking magnetic UI, bento grids, curtain footers, kinetic typography — is built for premium consumer SaaS marketing surfaces (Apple product pages, subscription app landing screens). It's genuinely excellent design language, for a different job.

Vyas has three real surfaces, and none of them are that job:

1. **Field App** (nurse/pharmacist/doctor) — cheap Android phone, outdoors, bright sunlight, patchy 2G/3G, seconds per interaction.
2. **Patient/Citizen Lookup** — mixed devices, possibly low digital literacy, mobile, no login.
3. **District Admin Dashboard** — laptop/tablet, indoors, stable connection, more time to spend per screen.

Implementing the requested spec literally would fight constraints already locked into `DECISIONS.md`:
- Dark mode + neon glow is close to unreadable in direct sunlight — the field app's actual operating condition.
- Heavy `backdrop-filter` blur is one of the most expensive render operations you can ask of a budget Android WebView — directly undermines ADR-003's offline-first, low-end-device performance requirement.
- Cursor-proximity and magnetic UI assume a mouse; this app is touch-first almost everywhere.
- Bento grids, curtain footers, and deck-of-cards scroll are conversion-page patterns; Vyas's screens are task tools, not a scroll journey.

What survives, adapted rather than discarded: obsessive spacing/typography/radius craft, purposeful (not decorative) motion, your reference image's morphing pill navbar (great fit for the patient app), and restrained glass/hover/tilt treatment on the admin dashboard, where the device, connection, and setting can actually support it.

---

## 1. Three Surfaces, Three Design Postures

| Surface | Context | Design posture |
|---|---|---|
| **Field App** | Budget Android, outdoors, bright sun, patchy signal, task takes <5 sec | Light-first, maximum contrast, huge tap targets, near-zero decorative motion, offline status always visible |
| **Patient Lookup** | Mixed devices, possibly low literacy, mobile, no login | Light-first, warm and approachable, icon+label pairing, a little more visual personality — this is where the pill navbar lives |
| **Admin Dashboard** | Laptop/tablet, indoors, stable connection, higher information tolerance | The one surface that can carry restrained glass, hover richness, and subtle tilt |

Everything below is organized by surface where the treatment actually differs.

---

## 2. Color System

Medical-app defaults (sterile blue/white, or borrowed hospital-SaaS neon) were flagged for replacement back in `ARCHITECTURE.md` — same principle applies here.

**Base palette (all surfaces, light-first):**
- Background: `#FAFAF8` (warm off-white, not clinical stark white — easier on eyes across long shifts)
- Surface/card: `#FFFFFF`
- Primary text: `#14181C` (near-black, not pure `#000` — softer on cheap LCD panels)
- Secondary text: `#5B6470`
- Border/divider: `#E4E7EB`

**Brand accent (distinct from generic medical blue):**
- Primary: `#0F6E5C` (deep clinical teal — calmer than hospital blue, reads as "trustworthy operations tool" not "generic SaaS")
- Primary tint (backgrounds, selected states): `#E3F3EF`

**Severity colors (functional, never decorative — same meaning everywhere they appear):**
- 🔴 Critical: `#D64545` / tint `#FBEAEA`
- 🟡 Warning: `#C98A1F` / tint `#FBF2E1` (amber, not pure yellow — better contrast for text-on-fill)
- 🟢 Watch/OK: `#2E8B57` / tint `#E9F5EE`

**Admin dashboard only — optional dark mode (user toggle, never default):**
- Background: `#0F1214` (rich charcoal, not pure OLED black)
- Surface: `#1A1E21`
- Same severity hues, saturation boosted ~10% for dark-background legibility

Color is never the sole signal — every severity indicator pairs color with an icon and a text label, both for accessibility and because color alone reads inconsistently in outdoor glare.

---

## 3. Typography

- **Typeface:** Inter (or system font stack as fallback — `-apple-system, "Segoe UI", Roboto`) across all surfaces. No custom web-font load blocking first paint on a 2G connection.
- **Field app minimum body size:** 16px. Non-negotiable — this is both an accessibility floor and a sunlight-legibility requirement, not a stylistic choice.
- **Type scale (field/patient app):** 14 / 16 / 20 / 28px (micro, body, section header, hero number — e.g., a stock count)
- **Type scale (admin dashboard):** 13 / 15 / 18 / 24 / 32px — more room for hierarchy since the surface tolerates more density
- **Tracking:** tight (-1 to -2%) on headers, normal-to-relaxed on body/microcopy — this piece of the original brief holds up fine everywhere.
- **Hindi text:** confirm the chosen font has full Devanagari coverage at the same weights as Latin — Inter does not; pair with **Noto Sans Devanagari** for Hindi strings specifically, matched at equivalent weight/size, not a fallback font mismatch.

---

## 4. Spatial System

| Token | Field/Patient app | Admin dashboard |
|---|---|---|
| Corner radius, buttons/inputs | 10px | 10px |
| Corner radius, cards | 16px | 20-24px |
| Corner radius, hero/large tiles | 20px | 28-32px (this is where the requested "exaggerated" radii legitimately fit) |
| Base spacing unit | 8px | 8px |
| Card padding | 16-20px | 20-28px |
| Minimum tap target | 48x48px | 40x40px (mouse precision allows tighter) |

Large 24-32px radii are reserved for the admin dashboard's bigger tiles — at field-app button sizes, exaggerated radii actually shrink the perceived tap target, which fights the "one tap beats one form" principle from `DECISIONS.md`.

**Shadows — functional, not ambient glow:** a single soft shadow (`0 2px 8px rgba(0,0,0,0.06)`) on elevated cards. The requested "ambient color bleed" (blurred shadow matching asset color) is replaced everywhere with **severity-tinted shadows on flag cards only** — a critical flag's card gets a faint red-tinted shadow, a watch-tier card a faint green one. Same "UI reacts to its content" idea, at a fraction of the render cost, and tied to actual meaning instead of decoration.

---

## 5. Motion System

### Field App — feedback only, nothing decorative
- Button press: 100ms scale-down (0.97), spring-out on release
- Optimistic write: instant UI update + a small pulse on the changed value, no skeleton loaders (they cost more perceived time than they save on a fast local state update)
- Offline→sync transition: the status banner (Section 6) cross-fades text, 150ms, no slide/bounce
- **No** scroll-linked animation, kinetic typography, or hover states — most of this surface is touch-only and single-screen; there's nothing to scroll-reveal on a "tap one button" screen.
- Every animation must run smoothly on a 3-4 year old budget Android CPU that's also running the offline sync service worker in the background — if it's not obviously cheap, cut it.

### Patient App — a little more warmth, still touch-first
- **Morphing pill navbar** (from your reference image): a simplified, lightweight version — CSS `width`/`padding` transition on scroll direction, compact on scroll-down, expanded on scroll-up. No blur, no glass; a solid or lightly-tinted `#FFFFFF` pill with the soft shadow token from Section 4. This is the one place your reference screenshot's aesthetic translates directly and well.
- Chatbot message appearance: 150ms fade+slight-rise, standard chat-app feel, nothing more elaborate.
- No cursor-tracking anything — there's no cursor.

### Admin Dashboard — the one surface earning richer motion
- Flag/redistribution cards: subtle 3D tilt on hover, capped at 2 degrees max, spring-eased (200-300ms), matching the original brief's own stated elegance cap.
- Hover state: soft border glow using the card's severity color at low opacity — a restrained, meaningful version of "proximity glow," tied to data rather than cursor position.
- One sanctioned use of glass: a modal/detail panel (e.g., clicking a flag card for full detail) may use a moderate `backdrop-filter: blur(8-12px)` — noticeably lighter than the requested 24px, and scoped to a single overlay element, not the whole UI, since this surface has the CPU and connection budget to spare occasionally.
- Realtime flag arrival: new flag card slides in from top with a soft highlight pulse that fades over ~1s — this is the one moment on the whole platform where a bit of "ta-da" is earned, since it's the dashboard's actual payoff moment.

All motion, on every surface: spring/cubic-bezier easing, 150-400ms, always triggered by a real user action or a real data event — never an idle loop.

---

## 6. Component Library

| Component | Field/Patient spec | Admin spec |
|---|---|---|
| **Severity badge** | Color fill (Section 2) + icon (🔴/🟡/🟢 equivalents as SVG, not emoji in production) + text label, 14px, always together | Same, plus tinted card shadow (Section 4) |
| **One-tap toggle** (bed occupied, test functional) | Full-width tap target, 48px min height, immediate optimistic state change, no confirm dialog for reversible actions | N/A — admin doesn't perform these writes |
| **Stock +/- stepper** | Two large tap zones either side of a live count, not a text input | N/A |
| **Voice button** | Circular, 56px, three visual states: idle (outline), listening (filled + subtle pulse ring, <300ms loop cap while actively listening only), processing (spinner) | N/A |
| **Offline/sync banner** | Persistent top strip, two states only: "Offline — N queued" (amber tint) / "Synced" (brief green flash, then hides) — never buried in a menu | N/A |
| **Flag card** | N/A (staff don't see the flag feed) | Facility name, category icon, severity badge, reason_text in selected language, tinted shadow, 2° tilt on hover |
| **Redistribution suggestion card** | N/A | From/to facility, item, distance, quantity, Actioned/Dismissed buttons |
| **Chatbot bubble** | Patient app: rounded 16px bubbles, sender-aligned, 16px min text | — |
| **Pill navbar** | Patient app only, per Section 5 | Admin uses a standard fixed sidebar instead — better fit for laptop information density than a floating pill |

---

## 7. Key Screens

**Staff Home (role-aware)**
Single scrollable column. Top: offline/sync banner (always visible). Below: 1-3 large tap-tile buttons based on role — pharmacist sees "Update Stock," nurse sees "Bed Status" + "Add Patient," both see today's own-facility summary in plain numbers, no charts. No navigation chrome beyond a simple back arrow and language toggle.

**Stock Update**
Search field (typed) + voice button side by side, equal visual weight — neither is the "real" input method. Selecting an item shows its name, current quantity, and the +/- stepper full-width. Confirmation only appears for voice-parsed low-confidence results (Section 5, Phase 9 of `BUILD.md`).

**Doctor Check-in/out**
One screen, one button, current status ("Checked in at 9:14 AM" / "Not checked in") as the only other content. No calendar, no schedule view.

**District Admin Dashboard**
Sidebar: district map (Leaflet) with facility markers color-coded by flag status. Main panel: live flag feed (Realtime), newest on top, filterable by severity. Secondary panel: redistribution suggestions. Header: language toggle, weekly report download link, optional dark-mode toggle.

**Patient Lookup**
Search or geolocate to nearest facility → single result card showing medicine/bed/test availability in plain icon+label rows, green/red presence indicators. Chatbot accessible via the pill navbar's search-morph state, for open-ended queries beyond the structured lookup.

**Offline Indicator**
Not a separate screen — a persistent Section 6 banner component present on every field-app screen, because this is the single most important piece of UI honesty in the whole product: the user must always know whether their last action is safely synced or still queued.

---

## 8. What Was Explicitly Dropped, and Why

| Requested element | Why it's dropped |
|---|---|
| Dark OLED + neon as default theme | Unreadable in direct sunlight, the field app's actual operating condition |
| `backdrop-filter: blur(24px)` broadly applied | Prohibitively expensive on budget Android WebViews; fights offline-first performance requirements |
| Cursor spotlight / proximity glow | Assumes a mouse; app is touch-first on every surface except admin |
| Magnetic UI (CTAs pulling toward cursor) | Same — no cursor on the surfaces that matter most, and disorienting on the one that has one |
| Asymmetrical bento grid layout | A landing-page pattern optimized for scroll-discovery; Vyas's screens are single-task tools, not content to browse |
| Curtain footer reveal | No marketing footer exists in this product — there's nothing at the "end of the page journey" to reveal |
| Kinetic typography (mask-slide headers) | Field app has near-zero scroll depth per screen; nothing to trigger this on, and it would delay legibility for a nurse mid-task |
| Sticky deck-of-cards scroll | No feature-list marketing section exists in the product to apply this to |
| Cinematic film-grain overlay | Pure decoration with a real render/file-size cost; no functional payoff on a bandwidth-constrained app |

## 9. What Was Adapted, Not Dropped

| Requested element | Where it survives, and how |
|---|---|
| Morphing pill navbar | Patient app, simplified to a lightweight width/padding transition, no glass |
| Liquid glassmorphism | Admin dashboard only, one modal/panel, blur reduced to 8-12px |
| 3D tilt on hover | Admin dashboard flag cards only, capped at 2°, exactly as elegantly-scoped as the original brief specified |
| Ambient color-bleed shadow | Replaced with severity-tinted shadows on flag cards — same "reacts to its content" idea, functional instead of decorative |
| Exaggerated fluid corners | Kept on admin dashboard's large tiles (24-32px); tightened on field-app buttons where big radii shrink perceived tap area |
| Spring-physics motion | Kept as the universal easing standard across all three surfaces |
| Premium geometric typeface | Kept (Inter), paired with Noto Sans Devanagari for Hindi coverage |

---

## 10. Performance & Accessibility Floor (non-negotiable, all surfaces)

- Contrast ratio ≥ 4.5:1 for all field-app text (WCAG AA), tested specifically against outdoor-glare visibility, not just a dark-room monitor check.
- No `backdrop-filter` on field or patient app, anywhere.
- Every icon paired with a text label — no icon-only controls, given the low-literacy design constraint from `DESIGN.md`.
- Minimum tap target 48x48px on field app, 44x44px on patient app, 40x40px on admin (mouse-driven).
- Total field-app first-load JS/CSS budget: treat this as seriously as the visual spec — a 2G connection is the actual constraint, and no amount of design polish matters if the app doesn't load.
