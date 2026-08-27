create extension if not exists pgcrypto;

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  facility_id uuid references public.facilities(id),
  full_name text not null,
  role text not null check (role in ('admin','supervisor','viewer'))
);

create table if not exists public.cleaners (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  full_name text not null,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.toilets (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  code text unique not null,
  name text not null,
  building text,
  floor text,
  area text,
  status text not null default 'NOT_CLEANED'
    check (status in ('NOT_CLEANED','NEEDS_CLEANING','OVERDUE','CLEANING','CLEAN','MAINTENANCE')),
  cleaning_interval_minutes int not null default 120,
  last_cleaned_at timestamptz,
  last_cleaner_id uuid references public.cleaners(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists toilets_facility_status_idx
  on public.toilets(facility_id,status);

create index if not exists toilets_last_cleaned_idx
  on public.toilets(facility_id,last_cleaned_at desc);

create table if not exists public.cleaning_sessions (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  toilet_id uuid not null references public.toilets(id),
  cleaner_id uuid not null references public.cleaners(id),
  status text not null check (status in ('IN_PROGRESS','COMPLETED','CANCELLED')),
  idempotency_key text unique not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  site_photo_path text,
  selfie_path text,
  gps_lat float8,
  gps_lng float8,
  gps_accuracy float8
);

create unique index if not exists one_active_cleaning_per_toilet
  on public.cleaning_sessions(toilet_id)
  where status = 'IN_PROGRESS';

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id),
  toilet_id uuid not null references public.toilets(id),
  kind text not null check (kind in ('HOUSEKEEPING','MAINTENANCE')),
  category text not null,
  status text not null default 'OPEN'
    check (status in ('OPEN','RESOLVED')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists feedback_open_idx
  on public.feedback(toilet_id,status,created_at desc);

create or replace view public.supervisor_toilet_view
with (security_invoker = true)
as
select
  t.id,
  t.facility_id,
  t.code,
  t.name,
  t.building,
  t.floor,
  t.area,
  t.status as derived_status,
  t.last_cleaned_at,
  lc.full_name as last_cleaner_name,
  active_cleaner.full_name as current_cleaner_name,
  coalesce(f.open_complaints,0)::int as open_complaints,
  case
    when t.status in ('NOT_CLEANED','NEEDS_CLEANING','OVERDUE','MAINTENANCE')
      then greatest(
        0,
        floor(
          extract(
            epoch from (
              now() - coalesce(
                f.oldest_open_at,
                t.last_cleaned_at,
                t.created_at
              )
            )
          ) / 60
        )
      )::int
    when t.status = 'CLEANING'
      then greatest(
        0,
        floor(
          extract(epoch from (now() - active_session.started_at)) / 60
        )
      )::int
    else 0
  end as attention_minutes
from public.toilets t
left join public.cleaners lc
  on lc.id = t.last_cleaner_id
left join lateral (
  select cleaner_id, started_at
  from public.cleaning_sessions s
  where s.toilet_id = t.id
    and s.status = 'IN_PROGRESS'
  limit 1
) active_session on true
left join public.cleaners active_cleaner
  on active_cleaner.id = active_session.cleaner_id
left join lateral (
  select
    count(*)::int as open_complaints,
    min(created_at) as oldest_open_at
  from public.feedback fb
  where fb.toilet_id = t.id
    and fb.status = 'OPEN'
) f on true
where t.active = true;

alter table public.facilities enable row level security;
alter table public.profiles enable row level security;
alter table public.toilets enable row level security;
alter table public.cleaners enable row level security;
alter table public.cleaning_sessions enable row level security;
alter table public.feedback enable row level security;

drop policy if exists "profile self" on public.profiles;
create policy "profile self"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "facility read" on public.facilities;
create policy "facility read"
on public.facilities for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or p.facility_id = facilities.id
      )
  )
);

drop policy if exists "toilet facility read" on public.toilets;
create policy "toilet facility read"
on public.toilets for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or p.facility_id = toilets.facility_id
      )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'toilets'
  ) then
    alter publication supabase_realtime add table public.toilets;
  end if;
end $$;
