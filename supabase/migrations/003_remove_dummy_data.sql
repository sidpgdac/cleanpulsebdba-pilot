-- This script deletes all dummy data (facilities, toilets, cleaners, etc) 
-- while keeping your Admin user account intact.

-- 1. Delete all transaction data
delete from public.cleaning_sessions;
delete from public.maintenance_issues;
delete from public.feedback;
delete from public.audit_logs;

-- 2. Delete all toilet-related data
delete from public.qr_codes;
delete from public.toilet_units;
delete from public.toilets;

-- 3. Delete cleaners
delete from public.cleaners;

-- 4. Unlink admin profiles from any facility
update public.profiles set facility_id = null;

-- 5. Delete facilities
delete from public.facilities;
