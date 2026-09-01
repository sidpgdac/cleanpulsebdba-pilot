-- Fix missing RLS policies for Admin insert/update operations

-- 1. Allow admins to insert and update facilities
drop policy if exists "facility insert" on public.facilities;
create policy "facility insert" on public.facilities for insert to authenticated 
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "facility update" on public.facilities;
create policy "facility update" on public.facilities for update to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "facility delete" on public.facilities;
create policy "facility delete" on public.facilities for delete to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 2. Allow admins to update their own profile (to assign facility_id)
drop policy if exists "profile update self" on public.profiles;
create policy "profile update self" on public.profiles for update to authenticated
using (id = auth.uid());

-- 3. Allow admins to insert/update/delete toilets
drop policy if exists "toilets insert" on public.toilets;
create policy "toilets insert" on public.toilets for insert to authenticated 
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "toilets update" on public.toilets;
create policy "toilets update" on public.toilets for update to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "toilets delete" on public.toilets;
create policy "toilets delete" on public.toilets for delete to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 4. Allow admins to manage qr_codes
drop policy if exists "qr codes insert" on public.qr_codes;
create policy "qr codes insert" on public.qr_codes for insert to authenticated 
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "qr codes update" on public.qr_codes;
create policy "qr codes update" on public.qr_codes for update to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "qr codes delete" on public.qr_codes;
create policy "qr codes delete" on public.qr_codes for delete to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 5. Allow admins to manage toilet_units
drop policy if exists "toilet units insert" on public.toilet_units;
create policy "toilet units insert" on public.toilet_units for insert to authenticated 
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 6. Allow admins to manage cleaners
drop policy if exists "cleaners insert" on public.cleaners;
create policy "cleaners insert" on public.cleaners for insert to authenticated 
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "cleaners update" on public.cleaners;
create policy "cleaners update" on public.cleaners for update to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "cleaners delete" on public.cleaners;
create policy "cleaners delete" on public.cleaners for delete to authenticated 
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 7. Allow admins to read cleaning_sessions
drop policy if exists "cleaning_sessions read admin" on public.cleaning_sessions;
create policy "cleaning_sessions read admin" on public.cleaning_sessions for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.facility_id = cleaning_sessions.facility_id));

-- Allow cleaners to read their own sessions (optional but good practice)
drop policy if exists "cleaning_sessions read cleaner" on public.cleaning_sessions;
create policy "cleaning_sessions read cleaner" on public.cleaning_sessions for select to authenticated
using (cleaner_id::text = auth.uid()::text);

-- Allow public to insert/update cleaning sessions? No, backend service role does this.
