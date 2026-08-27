-- Run AFTER schema.sql.
-- This creates only facility + sample toilets.
-- Create supervisor Auth user manually in Supabase Auth, then add its UUID to profiles.

insert into public.facilities (code,name)
values ('BDBA','BDBA Shatabdi Hospital')
on conflict (code) do nothing;

with f as (
  select id from public.facilities where code='BDBA'
)
insert into public.toilets
(facility_id,code,name,building,floor,area,status,cleaning_interval_minutes)
select f.id,'BDBA-T001','OPD Female Toilet','Main Building','Ground Floor','OPD','NEEDS_CLEANING',120 from f
on conflict (code) do nothing;

with f as (
  select id from public.facilities where code='BDBA'
)
insert into public.toilets
(facility_id,code,name,building,floor,area,status,cleaning_interval_minutes)
select f.id,'BDBA-T002','OPD Male Toilet','Main Building','Ground Floor','OPD','CLEAN',120 from f
on conflict (code) do nothing;
