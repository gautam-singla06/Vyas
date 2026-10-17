-- Security hardening: minimize anonymous exposure and close authorization
-- bypasses that application code alone cannot prevent.
drop policy if exists "stock_items_public_read" on public.stock_items;
drop policy if exists "bed_status_public_read" on public.bed_status;
drop policy if exists "test_availability_public_read" on public.test_availability;
drop policy if exists "facilities_read_open" on public.facilities;

-- Do not replace public access with authenticated-wide access: that would
-- expose every facility's coordinates and ABDM identifier to any signed-in
-- user. Staff need only their assigned facility; district admins need their
-- own district. Public availability is handled by the constrained server API.
create policy "facilities_self_read"
  on public.facilities for select to authenticated
  using (id = public.current_user_facility_id());

create policy "facilities_admin_district_read"
  on public.facilities for select to authenticated
  using (
    public.current_user_role() = 'admin'
    and district = public.current_user_district()
  );

-- Staff contact details are sensitive. There is no staff-directory feature,
-- so district admins must not receive every colleague's phone/email by default.
drop policy if exists "staff_admin_district_read" on public.staff;

-- A SECURITY DEFINER RPC must enforce its own caller scope because it bypasses
-- table RLS. Otherwise any authenticated user could increment any facility.
create or replace function public.increment_footfall(
  p_facility_id uuid,
  p_date date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if p_facility_id is distinct from public.current_user_facility_id()
     or public.current_user_role() not in ('nurse', 'pharmacist') then
    raise exception 'not authorized';
  end if;
  insert into public.footfall_logs (facility_id, date, count)
  values (p_facility_id, p_date, 1)
  on conflict (facility_id, date)
  do update set count = public.footfall_logs.count + 1
  returning count into v_count;
  return v_count;
end;
$$;

-- District admins may update only the status of suggestions wholly in their
-- district; a broad UPDATE policy previously allowed cross-district mutation.
revoke update on public.redistribution_suggestions from authenticated;
grant update (status) on public.redistribution_suggestions to authenticated;
drop policy if exists "redistribution_admin_update_status" on public.redistribution_suggestions;
create policy "redistribution_admin_update_status"
  on public.redistribution_suggestions for update to authenticated
  using (
    public.current_user_role() = 'admin'
    and from_facility_id in (select id from public.facilities where district = public.current_user_district())
    and to_facility_id in (select id from public.facilities where district = public.current_user_district())
  )
  with check (
    public.current_user_role() = 'admin'
    and from_facility_id in (select id from public.facilities where district = public.current_user_district())
    and to_facility_id in (select id from public.facilities where district = public.current_user_district())
  );
