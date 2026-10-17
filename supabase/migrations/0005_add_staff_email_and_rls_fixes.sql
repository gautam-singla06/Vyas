-- Migration 0005: Add email column to staff & fix RLS policies for attendance and flags
-- 
-- 1. Adds nullable unique email column to public.staff for district admins and official logins.
-- 2. Fixes doctor_attendance RLS policies (staff_id was compared to auth.uid() instead of public.staff.id).
-- 3. Grants district admins UPDATE permission on public.flags to resolve flags within their district.

-- 1. Add email column to public.staff
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'staff' and column_name = 'email'
  ) then
    alter table public.staff add column email text unique;
    create index if not exists staff_email_idx on public.staff(lower(email));
  end if;
end $$;

-- 2. Fix doctor_attendance RLS policies
-- Previous policy used staff_id = auth.uid(), but staff_id is public.staff.id, while auth.uid() is auth.users.id.
drop policy if exists "doctor_attendance_self_write" on public.doctor_attendance;
drop policy if exists "doctor_attendance_self_read" on public.doctor_attendance;

create policy "doctor_attendance_self_write"
  on public.doctor_attendance for all
  to authenticated
  using (staff_id in (select s.id from public.staff s where s.user_id = auth.uid()))
  with check (staff_id in (select s.id from public.staff s where s.user_id = auth.uid()));

create policy "doctor_attendance_self_read"
  on public.doctor_attendance for select
  to authenticated
  using (staff_id in (select s.id from public.staff s where s.user_id = auth.uid()));

-- 3. Fix flags update policy for district admins (resolving flags)
grant update (resolved) on public.flags to authenticated;

drop policy if exists "flags_admin_update" on public.flags;
create policy "flags_admin_update"
  on public.flags for update
  to authenticated
  using (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  )
  with check (
    public.current_user_role() = 'admin'
    and facility_id in (
      select f.id from public.facilities f
      where f.district = public.current_user_district()
    )
  );

