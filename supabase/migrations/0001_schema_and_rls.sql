-- MediServ — Phase 1: Schema, enums, constraints, and Row Level Security.
-- Per ARCHITECTURE.md Section 7 and DECISIONS.md (ADR-002 unified BaaS,
-- ADR-007 phone/OTP + RLS, ADR-010 flat data models, ADR-005 deterministic-
-- then-generative — reason_text nullable at insert time).
--
-- Run from the Supabase SQL editor, or apply via the Supabase CLI:
--   supabase db push
-- (or paste into the SQL editor in order: schema -> RLS -> seed).

-- =============================================================================
-- Extensions
-- =============================================================================
create extension if not exists "pgcrypto";  -- gen_random_uuid()
create extension if not exists "uuid-ossp";

-- =============================================================================
-- Enums
-- =============================================================================
do $$
begin
  create type facility_type as enum ('PHC', 'CHC');
exception when duplicate_object then null; end $$;

do $$
begin
  create type staff_role as enum ('nurse', 'pharmacist', 'doctor', 'admin');
exception when duplicate_object then null; end $$;

do $$
begin
  create type stock_log_source as enum ('app', 'voice', 'sms');
exception when duplicate_object then null; end $$;

do $$
begin
  create type flag_category as enum ('stock', 'bed', 'doctor', 'test');
exception when duplicate_object then null; end $$;

do $$
begin
  create type flag_severity as enum ('critical', 'warning', 'watch');
exception when duplicate_object then null; end $$;

do $$
begin
  create type redistribution_status as enum ('pending', 'actioned', 'dismissed');
exception when duplicate_object then null; end $$;

do $$
begin
  create type chat_language as enum ('en', 'hi');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- Tables
-- =============================================================================

-- facilities: read-open to allow the no-login public lookup (ADR-008) and
-- admin cross-facility reads. Facility-level write scope is enforced via RLS
-- on the child tables through the facility_id relationship.
create table if not exists public.facilities (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            facility_type not null,
  district        text not null,
  block           text not null,
  lat             numeric(9,6) not null,
  lng             numeric(9,6) not null,
  abdm_facility_id text,  -- reserved/nullable per ADR-010 roadmap note
  created_at      timestamptz not null default now()
);

-- staff: one row per field worker, keyed by auth.users.id (the Supabase Auth
-- user). Phone is unique — login resolves to at most one staff row.
create table if not exists public.staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,
  facility_id uuid not null references public.facilities(id) on delete restrict,
  role        staff_role not null,
  phone       text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists staff_facility_id_idx on public.staff(facility_id);
create index if not exists staff_user_id_idx on public.staff(user_id);

-- stock_items: current state per item per facility. updated_at reflects the
-- last successful sync; the authoritative history lives in stock_logs.
create table if not exists public.stock_items (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  item_name   text not null,
  quantity    integer not null default 0 check (quantity >= 0),
  unit        text not null default 'units',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.staff(id) on delete set null
);

create unique index if not exists stock_items_facility_item_uq
  on public.stock_items(facility_id, lower(item_name));
create index if not exists stock_items_facility_id_idx on public.stock_items(facility_id);

-- stock_logs: append-only delta log. NEVER updated or deleted (ADR-003 audit
-- trail). Drives the 14-day rolling-average forecast (ADR-005).
create table if not exists public.stock_logs (
  id            uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete restrict,
  delta         integer not null,  -- negative = consumption, positive = restock
  source        stock_log_source not null default 'app',
  created_at    timestamptz not null default now()
);

create index if not exists stock_logs_item_created_idx
  on public.stock_logs(stock_item_id, created_at desc);

-- bed_status: flat total/occupied/available model — no sub-types (ADR-010).
-- One row per facility (facility_id is the primary key).
create table if not exists public.bed_status (
  facility_id uuid primary key references public.facilities(id) on delete cascade,
  total       integer not null default 0 check (total >= 0),
  occupied    integer not null default 0 check (occupied >= 0),
  updated_at  timestamptz not null default now(),
  check (occupied <= total)
);

-- doctor_attendance: geo-tagged check-in/out. check_out nullable = open session.
create table if not exists public.doctor_attendance (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.staff(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  check_in    timestamptz not null default now(),
  check_out   timestamptz,
  geo_lat     numeric(9,6),  -- nullable: location denied is not a hard failure
  geo_lng     numeric(9,6),
  check (check_out is null or check_out >= check_in)
);

create index if not exists doctor_attendance_staff_open_idx
  on public.doctor_attendance(staff_id)
  where check_out is null;

-- test_availability: binary functional/non-functional per test type — no
-- hardcoded CT/MRI/ECG taxonomy (ADR-010).
create table if not exists public.test_availability (
  id           uuid primary key default gen_random_uuid(),
  facility_id  uuid not null references public.facilities(id) on delete cascade,
  test_name    text not null,
  is_functional boolean not null default true,
  updated_at   timestamptz not null default now()
);

create unique index if not exists test_availability_facility_test_uq
  on public.test_availability(facility_id, lower(test_name));

-- footfall_logs: anonymous daily counter per facility. NO patient identity
-- (ADR-010). Part of the Resource Monitoring bounded context per BUILD.md note.
create table if not exists public.footfall_logs (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  date        date not null,
  count       integer not null default 0 check (count >= 0)
);

create unique index if not exists footfall_facility_date_uq
  on public.footfall_logs(facility_id, date);

-- flags: created by the deterministic compute stage with severity set and
-- reason_text* NULL — the generative layer (Gemini) fills reason_text later.
-- reason_text is nullable ON PURPOSE (ADR-005 failure isolation).
create table if not exists public.flags (
  id             uuid primary key default gen_random_uuid(),
  facility_id    uuid not null references public.facilities(id) on delete cascade,
  category       flag_category not null,
  severity       flag_severity not null,
  reason_text_en text,
  reason_text_hi text,
  created_at     timestamptz not null default now(),
  resolved       boolean not null default false
);

create index if not exists flags_facility_unresolved_idx
  on public.flags(facility_id)
  where resolved = false;
create index if not exists flags_created_idx on public.flags(created_at desc);

-- redistribution_suggestions: AI-module output, suggestion-only — never
-- triggers an actual transfer (ADR-012). Status mutates on admin action.
create table if not exists public.redistribution_suggestions (
  id               uuid primary key default gen_random_uuid(),
  item_name        text not null,
  from_facility_id uuid not null references public.facilities(id) on delete cascade,
  to_facility_id   uuid not null references public.facilities(id) on delete cascade,
  suggested_qty    integer not null check (suggested_qty >= 0),
  distance_km      numeric(8,2) not null check (distance_km >= 0),
  status           redistribution_status not null default 'pending',
  created_at       timestamptz not null default now()
);

create index if not exists redistribution_pending_idx
  on public.redistribution_suggestions(to_facility_id)
  where status = 'pending';

-- chat_logs: anonymous patient sessions. No identity, no auth. Insert-only
-- (no RLS read gate) per ADR-008.
create table if not exists public.chat_logs (
  id              uuid primary key default gen_random_uuid(),
  facility_id     uuid references public.facilities(id) on delete set null,
  patient_session text,  -- anonymous client-generated token, no identity
  language        chat_language not null,
  message         text not null,
  response        text,
  created_at      timestamptz not null default now()
);

-- =============================================================================
-- Row Level Security  (ADR-007 — hard requirement)
-- =============================================================================

-- Helper: a SECURITY DEFINER function that returns the authenticated user's
-- facility_id (and null for anon), callable from policies without needing the
-- caller to have SELECT on staff directly. Stable, search_path-locked.
create or replace function public.current_user_facility_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select staff.facility_id
  from public.staff staff
  where staff.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select staff.role
  from public.staff staff
  where staff.user_id = auth.uid()
  limit 1;
$$;

-- The admin's district is the district of their facility_id.
create or replace function public.current_user_district()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select facilities.district
  from public.facilities
  join public.staff on staff.facility_id = facilities.id
  where staff.user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- facilities: read-open (public lookup needs this). Writes restricted to
-- service role (seed/admin provisioning) — not opened to field staff.
-- ---------------------------------------------------------------------------
alter table public.facilities enable row level security;

create policy "facilities_read_open"
  on public.facilities for select
  using (true);

-- ---------------------------------------------------------------------------
-- staff: a user may read their own row; an admin may read all staff rows in
-- their own district. Writes (create/update/delete) via service role only.
-- ---------------------------------------------------------------------------
alter table public.staff enable row level security;

create policy "staff_self_read"
  on public.staff for select
  to authenticated
  using (user_id = auth.uid());

create policy "staff_admin_district_read"
  on public.staff for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

-- ---------------------------------------------------------------------------
-- stock_items: writable only by staff of the SAME facility (nurse/pharmacist).
-- Readable by the facility's own staff, by the district admin, and
-- anonymously for the public lookup (ADR-008) — availability is public info.
-- ---------------------------------------------------------------------------
alter table public.stock_items enable row level security;

create policy "stock_items_self_facility_write"
  on public.stock_items for all
  to authenticated
  using (facility_id = public.current_user_facility_id())
  with check (facility_id = public.current_user_facility_id());

create policy "stock_items_admin_district_read"
  on public.stock_items for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

create policy "stock_items_public_read"
  on public.stock_items for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- stock_logs: writable only by the facility's own staff (through their
-- stock_items) and by the service role (AI module, SMS webhook). Readable by
-- the facility's staff and the district admin. Read-only to anon is NOT
-- granted — logs are internal operational data, not public info.
-- ---------------------------------------------------------------------------
alter table public.stock_logs enable row level security;

create policy "stock_logs_self_facility_write"
  on public.stock_logs for insert
  to authenticated
  with check (
    stock_item_id in (
      select si.id from public.stock_items si
      where si.facility_id = public.current_user_facility_id()
    )
  );

create policy "stock_logs_self_facility_read"
  on public.stock_logs for select
  to authenticated
  using (
    stock_item_id in (
      select si.id from public.stock_items si
      where si.facility_id = public.current_user_facility_id()
    )
  );

create policy "stock_logs_admin_district_read"
  on public.stock_logs for select
  to authenticated
  using (
    stock_item_id in (
      select si.id from public.stock_items si
      join public.facilities f on f.id = si.facility_id
      where f.district = public.current_user_district()
    )
    and public.current_user_role() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- bed_status: writable by the facility's own staff, readable by same + admin.
-- Also public-readable so the patient lookup can show bed availability.
-- ---------------------------------------------------------------------------
alter table public.bed_status enable row level security;

create policy "bed_status_self_facility_write"
  on public.bed_status for all
  to authenticated
  using (facility_id = public.current_user_facility_id())
  with check (facility_id = public.current_user_facility_id());

create policy "bed_status_admin_district_read"
  on public.bed_status for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

create policy "bed_status_public_read"
  on public.bed_status for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- doctor_attendance: a doctor writes only their own rows; their facility's
-- other staff cannot write them. Readable by the doctor themselves, the
-- facility's admin, and the district admin.
-- ---------------------------------------------------------------------------
alter table public.doctor_attendance enable row level security;

create policy "doctor_attendance_self_write"
  on public.doctor_attendance for all
  to authenticated
  using (staff_id = auth.uid())
  with check (staff_id = auth.uid());

create policy "doctor_attendance_self_read"
  on public.doctor_attendance for select
  to authenticated
  using (staff_id = auth.uid());

create policy "doctor_attendance_admin_district_read"
  on public.doctor_attendance for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

-- ---------------------------------------------------------------------------
-- test_availability: writable by the facility's staff, readable by same +
-- admin + anon (public lookup of "can I get this test done here today").
-- ---------------------------------------------------------------------------
alter table public.test_availability enable row level security;

create policy "test_availability_self_facility_write"
  on public.test_availability for all
  to authenticated
  using (facility_id = public.current_user_facility_id())
  with check (facility_id = public.current_user_facility_id());

create policy "test_availability_admin_district_read"
  on public.test_availability for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

create policy "test_availability_public_read"
  on public.test_availability for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- footfall_logs: writable/readable by the facility's staff + district admin.
-- NOT public-readable — internal operational data.
-- ---------------------------------------------------------------------------
alter table public.footfall_logs enable row level security;

create policy "footfall_self_facility_write"
  on public.footfall_logs for all
  to authenticated
  using (facility_id = public.current_user_facility_id())
  with check (facility_id = public.current_user_facility_id());

create policy "footfall_admin_district_read"
  on public.footfall_logs for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

-- ---------------------------------------------------------------------------
-- flags & redistribution_suggestions: WRITTABLE only by the service role
-- (server-side AI module). READABLE by the district admin (across district)
-- and by a facility's own staff (their own facility only).
-- Bug: medical officer never writes flags.
-- ---------------------------------------------------------------------------
alter table public.flags enable row level security;

create policy "flags_service_role_all"
  on public.flags for all
  to service_role
  using (true)
  with check (true);

create policy "flags_admin_district_read"
  on public.flags for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

create policy "flags_self_facility_read"
  on public.flags for select
  to authenticated
  using (facility_id = public.current_user_facility_id());

alter table public.redistribution_suggestions enable row level security;

create policy "redistribution_service_role_all"
  on public.redistribution_suggestions for all
  to service_role
  using (true)
  with check (true);

create policy "redistribution_admin_district_read"
  on public.redistribution_suggestions for select
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and (
      from_facility_id in (
        select f.id from public.facilities f
        where f.district = public.current_user_district()
      )
      or to_facility_id in (
        select f.id from public.facilities f
        where f.district = public.current_user_district()
      )
    )
  );

-- Admin may update status (actioned / dismissed) — never insert/delete.
create policy "redistribution_admin_update_status"
  on public.redistribution_suggestions for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ---------------------------------------------------------------------------
-- chat_logs: INSERT-only by anyone (anon included). No read path from the
-- app — internal audit only. (ADR-008 — anonymous sessions, no identity.)
-- ---------------------------------------------------------------------------
alter table public.chat_logs enable row level security;

create policy "chat_logs_insert_any"
  on public.chat_logs for insert
  to anon, authenticated
  with check (true);

-- Service role can read for audit/diagnostics.
create policy "chat_logs_service_role_read"
  on public.chat_logs for select
  to service_role
  using (true);

-- =============================================================================
-- REVOKES — belt & suspenders: ensure the anon key cannot escalate beyond the
-- intended public reads even if a future table is misconfigured.
-- Revoke any default privileges granted to public (anon role) on internal
-- tables; their access is controlled purely by the explicit policies above.
-- =============================================================================
revoke insert, update, delete on public.staff from anon;
revoke insert, update, delete on public.stock_logs from anon;
revoke insert, update, delete on public.doctor_attendance from anon;
revoke insert, update, delete on public.footfall_logs from anon;
revoke insert, update, delete on public.flags from anon, authenticated;
revoke insert, update, delete on public.redistribution_suggestions from anon, authenticated;
