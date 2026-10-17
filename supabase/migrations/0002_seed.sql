-- MediServ — Phase 1: Seed data for the demo.
-- 5 facilities across one district ("Sitapur", UP) with plausible lat/lng,
-- 14+ days of stock_logs history for at least one item trending toward a
-- critical flag (per Phase 16 demo-prep guidance), plus bed_status and
-- test_availability rows. Idempotent on re-run via ON CONFLICT.
--
-- These inserts run as the service / postgres role (the seed script) and so
-- bypass RLS by design. Facility IDs are fixed so staff and child rows
-- can reference them deterministically.

begin;

-- Fixed facility UUIDs (one CHC, four PHCs) for Sitapur district, UP.
insert into public.facilities (id, name, type, district, block, lat, lng) values
  ('a0000000-0000-4000-8000-000000000001', 'CHC Sitapur Sadar', 'CHC', 'Sitapur', 'Sitapur', 27.1070, 80.8040),
  ('a0000000-0000-4000-8000-000000000002', 'PHC Rampur',        'PHC', 'Sitapur', 'Biswan', 27.1750, 81.0120),
  ('a0000000-0000-4000-8000-000000000003', 'PHC Laharpur',      'PHC', 'Sitapur', 'Laharpur', 27.2350, 80.8450),
  ('a0000000-0000-4000-8000-000000000004', 'PHC Sidhauli',      'PHC', 'Sitapur', 'Sidhauli', 27.0690, 80.8480),
  ('a0000000-0000-4000-8000-000000000005', 'PHC Maholi',        'PHC', 'Sitapur', 'Maholi', 27.2620, 80.4580)
on conflict (id) do nothing;

-- bed_status: "flat total/occupied/available" model per ADR-010.
-- CHC Sitapur Sadar is at full occupancy -> should auto-flag critical (Phase 6).
insert into public.bed_status (facility_id, total, occupied, updated_at) values
  ('a0000000-0000-4000-8000-000000000001', 30, 30, now()),
  ('a0000000-0000-4000-8000-000000000002', 10, 6,  now()),
  ('a0000000-0000-4000-8000-000000000003', 8,  3,  now()),
  ('a0000000-0000-4000-8000-000000000004', 10, 9,  now()),  -- 90% -> warning-tier
  ('a0000000-0000-4000-8000-000000000005', 6,  2,  now())
on conflict (facility_id) do update
  set total = excluded.total,
      occupied = excluded.occupied,
      updated_at = now();

-- test_availability: a couple of common PHC tests; one is broken (will flag).
insert into public.test_availability (facility_id, test_name, is_functional, updated_at)
select f.id, t.name, t.functional, now()
from (values
  ('a0000000-0000-4000-8000-000000000001', 'Blood Count',     true),
  ('a0000000-0000-4000-8000-000000000001', 'Urine Routine',   true),
  ('a0000000-0000-4000-8000-000000000001', 'X-Ray',           false),  -- down -> flag
  ('a0000000-0000-4000-8000-000000000002', 'Blood Count',     true),
  ('a0000000-0000-4000-8000-000000000002', 'Malaria Smear',    true),
  ('a0000000-0000-4000-8000-000000000003', 'Blood Count',     true),
  ('a0000000-0000-4000-8000-000000000004', 'Urine Routine',   false),  -- down -> flag
  ('a0000000-0000-4000-8000-000000000005', 'Blood Count',     true)
) as seed(f_id, name, functional)
join public.facilities f on f.id::text = seed.f_id
on conflict (facility_id, lower(test_name)) do update
  set is_functional = excluded.is_functional, updated_at = now();

-- stock_items: Paracetamol at PHC Rampur trending critical, with surplus at
-- CHC Sitapur Sadar (so Phase 7's redistribution matcher will propose a
-- transfer from CHC -> PHC Rampur).
-- Note: staff `updated_by` is left null here; once Phase 2 provisions staff
-- rows, the live writes will set it. The seed writes use the service role.
insert into public.stock_items (facility_id, item_name, quantity, unit, updated_at)
select f.id, si.name, si.qty, si.unit, now()
from (values
  ('a0000000-0000-4000-8000-000000000002', 'Paracetamol',   8,   'tablets'),  -- low -> trending critical
  ('a0000000-0000-4000-8000-000000000001', 'Paracetamol',   1200,'tablets'), -- surplus -> redistribution source
  ('a0000000-0000-4000-8000-000000000002', 'ORS',           60,  'sachets'),
  ('a0000000-0000-4000-8000-000000000003', 'Paracetamol',   200, 'tablets'),
  ('a0000000-0000-4000-8000-000000000003', 'Iron Folic Acid', 90, 'tablets'),
  ('a0000000-0000-4000-8000-000000000004', 'Paracetamol',   40,  'tablets'), -- low-ish -> watch/warning
  ('a0000000-0000-4000-8000-000000000005', 'Paracetamol',   300, 'tablets')
) as seed(f_id, name, qty, unit)
join public.facilities f on f.id::text = seed.f_id
on conflict (facility_id, lower(item_name)) do update
  set quantity = excluded.quantity,
      unit = excluded.unit,
      updated_at = now();

-- stock_logs: 14 days of plausible consumption history for Paracetamol at
-- PHC Rampur so the Phase 6 forecast crosses the critical threshold (<=3 days).
-- Daily consumption of ~3 tablets/day from quantity ~50 down to the current 8
-- across 14 days => rolling avg ~3/day => days-to-zero = 8/3 ~ 2.7 -> CRITICAL.
--
-- We generate the 14 daily -3 deltas programmatically to keep this readable.
-- Generated deltas are inserted with created_at stepping back from today.
insert into public.stock_logs (stock_item_id, delta, source, created_at)
select
  si.id,
  -3,
  'app'::stock_log_source,
  (date_trunc('day', now()) - (n || ' days')::interval) + '09:00:00'::time
from public.stock_items si
cross join generate_series(1, 14) as n
where si.facility_id = 'a0000000-0000-4000-8000-000000000002'
  and lower(si.item_name) = 'paracetamol'
  and not exists (
    select 1 from public.stock_logs sl
    where sl.stock_item_id = si.id
      and sl.created_at::date = (date_trunc('day', now()) - (n || ' days')::interval)::date
  );

-- A modest consumption history for Paracetamol at PHC Sidhauli (qty 40)
-- so its forecast sits in the WATCH/WARNING band rather than at zero.
insert into public.stock_logs (stock_item_id, delta, source, created_at)
select
  si.id,
  -2,
  'app'::stock_log_source,
  (date_trunc('day', now()) - (n || ' days')::interval) + '10:00:00'::time
from public.stock_items si
cross join generate_series(1, 14) as n
where si.facility_id = 'a0000000-0000-4000-8000-000000000004'
  and lower(si.item_name) = 'paracetamol'
  and not exists (
    select 1 from public.stock_logs sl
    where sl.stock_item_id = si.id
      and sl.created_at::date = (date_trunc('day', now()) - (n || ' days')::interval)::date
  );

commit;

-- Verification queries (safe to run independently):
--   select f.name, si.item_name, si.quantity, bs.total, bs.occupied
--   from facilities f
--   left join stock_items si on si.facility_id = f.id
--   left join bed_status bs on bs.facility_id = f.id;
