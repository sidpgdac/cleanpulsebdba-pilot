-- Migration 002: Serverless Architecture (No Node.js Backend)
-- This file creates the necessary RPCs and RLS policies to allow the frontend to communicate directly with Supabase securely.

-- Enable pgcrypto for PIN hashing comparison
create extension if not exists pgcrypto;

---------------------------------------------------------
-- 1. ANONYMOUS READ POLICIES (For QR Flow)
---------------------------------------------------------

drop policy if exists "anon read active toilets" on public.toilets;
create policy "anon read active toilets"
on public.toilets for select
to anon, authenticated
using (active = true);

drop policy if exists "anon read active cleaners" on public.cleaners;
create policy "anon read active cleaners"
on public.cleaners for select
to anon, authenticated
using (active = true);

---------------------------------------------------------
-- 2. FEEDBACK RPC
---------------------------------------------------------
create or replace function submit_feedback(p_toilet_code text, p_category text)
returns void
language plpgsql
security definer
as $$
declare
  v_toilet record;
  v_is_maintenance boolean;
begin
  -- Find toilet
  select id, facility_id into v_toilet
  from public.toilets
  where code = upper(p_toilet_code) and active = true;

  if v_toilet is null then
    raise exception 'Toilet not found';
  end if;

  v_is_maintenance := p_category in ('No water', 'Broken item', 'Broken flush', 'Blocked toilet');

  -- Insert feedback
  insert into public.feedback (facility_id, toilet_id, kind, category, status)
  values (v_toilet.facility_id, v_toilet.id, case when v_is_maintenance then 'MAINTENANCE' else 'HOUSEKEEPING' end, p_category, 'OPEN');

  -- Update toilet status
  update public.toilets
  set status = case when v_is_maintenance then 'MAINTENANCE' else 'NEEDS_CLEANING' end
  where id = v_toilet.id;
end;
$$;

grant execute on function submit_feedback to anon, authenticated;

---------------------------------------------------------
-- 3. CLEANER AUTHENTICATION & SESSION RPCS
---------------------------------------------------------
create or replace function cleaner_start_session(
  p_toilet_code text, 
  p_cleaner_id uuid, 
  p_pin text, 
  p_idempotency_key text
)
returns public.cleaning_sessions
language plpgsql
security definer
as $$
declare
  v_toilet record;
  v_cleaner record;
  v_existing_session public.cleaning_sessions;
  v_new_session public.cleaning_sessions;
begin
  -- Find toilet
  select id, facility_id into v_toilet
  from public.toilets
  where code = upper(p_toilet_code) and active = true;

  if v_toilet is null then
    raise exception 'Toilet not found';
  end if;

  -- Find cleaner
  select id, facility_id, pin_hash, active into v_cleaner
  from public.cleaners
  where id = p_cleaner_id;

  if v_cleaner is null or not v_cleaner.active or v_cleaner.facility_id != v_toilet.facility_id then
    raise exception 'Cleaner is not authorized for this hospital';
  end if;

  -- Verify PIN
  if v_cleaner.pin_hash != crypt(p_pin, v_cleaner.pin_hash) then
    raise exception 'Incorrect PIN';
  end if;

  -- Check existing in-progress session for this toilet
  select * into v_existing_session
  from public.cleaning_sessions
  where toilet_id = v_toilet.id and status = 'IN_PROGRESS';

  if v_existing_session.id is not null then
    if v_existing_session.cleaner_id = p_cleaner_id then
      return v_existing_session;
    else
      raise exception 'Cleaning already in progress by another cleaner';
    end if;
  end if;

  -- Create new session
  insert into public.cleaning_sessions (facility_id, toilet_id, cleaner_id, status, idempotency_key)
  values (v_toilet.facility_id, v_toilet.id, p_cleaner_id, 'IN_PROGRESS', p_idempotency_key)
  returning * into v_new_session;

  -- Update toilet
  update public.toilets set status = 'CLEANING' where id = v_toilet.id;

  return v_new_session;
end;
$$;

grant execute on function cleaner_start_session to anon, authenticated;


create or replace function cleaner_complete_session(
  p_session_id uuid, 
  p_cleaner_id uuid, 
  p_pin text, 
  p_site_photo_path text, 
  p_selfie_path text, 
  p_lat float8, 
  p_lng float8, 
  p_accuracy float8
)
returns void
language plpgsql
security definer
as $$
declare
  v_session record;
  v_cleaner record;
  v_now timestamp with time zone := now();
begin
  -- Find session
  select id, toilet_id, cleaner_id, status into v_session
  from public.cleaning_sessions
  where id = p_session_id and status = 'IN_PROGRESS';

  if v_session is null or v_session.cleaner_id != p_cleaner_id then
    raise exception 'Cleaning session is not active or unauthorized';
  end if;

  -- Find cleaner
  select id, pin_hash into v_cleaner
  from public.cleaners
  where id = p_cleaner_id;

  -- Verify PIN
  if v_cleaner.pin_hash != crypt(p_pin, v_cleaner.pin_hash) then
    raise exception 'Incorrect PIN';
  end if;

  -- Complete session
  update public.cleaning_sessions
  set 
    status = 'COMPLETED',
    completed_at = v_now,
    site_photo_path = p_site_photo_path,
    selfie_path = p_selfie_path,
    gps_lat = p_lat,
    gps_lng = p_lng,
    gps_accuracy = p_accuracy
  where id = v_session.id;

  -- Update toilet
  update public.toilets
  set 
    status = 'CLEAN',
    last_cleaned_at = v_now,
    last_cleaner_id = v_session.cleaner_id
  where id = v_session.toilet_id;

  -- Resolve housekeeping feedback
  update public.feedback
  set status = 'RESOLVED', resolved_at = v_now
  where toilet_id = v_session.toilet_id and kind = 'HOUSEKEEPING' and status = 'OPEN';
end;
$$;

grant execute on function cleaner_complete_session to anon, authenticated;


---------------------------------------------------------
-- 4. STORAGE SETUP & ANONYMOUS UPLOAD RLS
---------------------------------------------------------
-- Insert the cleaning-evidence bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('cleaning-evidence', 'cleaning-evidence', true)
on conflict (id) do update set public = true;

-- Allow public read access to all files in cleaning-evidence
create policy "Public Access to Evidence"
on storage.objects for select
to public
using ( bucket_id = 'cleaning-evidence' );

-- Allow anonymous uploads if the session is currently IN_PROGRESS
-- The path is expected to be: {facility_id}/{toilet_id}/{session_id}/{filename}
-- Which means foldername(name)[3] is the session_id
drop policy if exists "Anon Evidence Uploads" on storage.objects;
create policy "Anon Evidence Uploads"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'cleaning-evidence'
  and exists (
    select 1 from public.cleaning_sessions
    where id::text = (string_to_array(name, '/'))[3]
    and status = 'IN_PROGRESS'
  )
);
