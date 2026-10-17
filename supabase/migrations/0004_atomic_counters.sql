-- =============================================================================
-- Migration 0004: Atomic counter RPCs
--
-- Replaces read-then-write increment logic (which lost updates under
-- concurrency) with single-statement INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING functions:
--   * increment_rate_limit  — used by lib/rate-limit.ts
--   * increment_footfall     — used by domain/resource-monitoring/actions.ts
--
-- Both are SECURITY DEFINER so the counter update runs atomically regardless of
-- the caller's RLS; the application layer already verifies ownership before
-- calling increment_footfall, and rate limiting is internal infrastructure.
-- =============================================================================

-- Atomic fixed-window rate-limit hit counter. Returns the post-increment count.
create or replace function public.increment_rate_limit(
  p_ip_or_phone text,
  p_window_start timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (ip_or_phone, window_start, hit_count)
  values (p_ip_or_phone, p_window_start, 1)
  on conflict (ip_or_phone, window_start)
  do update set hit_count = public.rate_limits.hit_count + 1
  returning hit_count into v_count;
  return v_count;
end;
$$;

-- Atomic per-facility, per-day footfall counter. Returns the post-increment
-- count. Conflict target matches the footfall_facility_date_uq unique index.
create or replace function public.increment_footfall(
  p_facility_id uuid,
  p_date date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.footfall_logs (facility_id, date, count)
  values (p_facility_id, p_date, 1)
  on conflict (facility_id, date)
  do update set count = public.footfall_logs.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- increment_rate_limit is called with the service-role client only.
revoke all on function public.increment_rate_limit(text, timestamptz) from public, anon, authenticated;
grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;

-- increment_footfall is called from a Server Action using the authenticated
-- (RLS) client after the app verifies the caller owns the facility.
revoke all on function public.increment_footfall(uuid, date) from public, anon;
grant execute on function public.increment_footfall(uuid, date) to authenticated, service_role;
