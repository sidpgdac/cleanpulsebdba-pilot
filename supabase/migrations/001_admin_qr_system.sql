-- 1. Create toilet_units
create table if not exists public.toilet_units (
  id uuid primary key default gen_random_uuid(),
  toilet_id uuid not null references public.toilets(id) on delete cascade,
  unit_code text not null unique,
  unit_no integer not null,
  unit_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (toilet_id, unit_no)
);

-- 2. Create qr_codes
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  toilet_id uuid not null references public.toilets(id) on delete cascade,
  qr_code text not null unique,
  target_url text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  generated_at timestamptz not null default now(),
  last_printed_at timestamptz,
  scan_count bigint not null default 0,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now()
);

-- Ensure only one active QR per toilet
create unique index if not exists one_active_qr_per_toilet
  on public.qr_codes(toilet_id)
  where status = 'ACTIVE';

-- 3. Create maintenance_issues
create table if not exists public.maintenance_issues (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete cascade,
  toilet_id uuid not null references public.toilets(id) on delete cascade,
  unit_id uuid references public.toilet_units(id) on delete cascade,
  source_feedback_id uuid references public.feedback(id) on delete set null,
  category text not null,
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  description text,
  reported_by_type text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  resolved_at timestamptz
);

create index if not exists maintenance_issues_open_idx
  on public.maintenance_issues(toilet_id, status) where status != 'RESOLVED';

-- 4. Create audit_logs
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  facility_id uuid references public.facilities(id) on delete cascade,
  actor_id uuid, -- could be a profile (auth.users) or null (system)
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_facility_idx on public.audit_logs(facility_id, created_at desc);

-- 5. RLS Policies
alter table public.toilet_units enable row level security;
alter table public.qr_codes enable row level security;
alter table public.maintenance_issues enable row level security;
alter table public.audit_logs enable row level security;

-- Toilet units read access
drop policy if exists "toilet units read" on public.toilet_units;
create policy "toilet units read"
on public.toilet_units for select
to authenticated
using (
  exists (
    select 1
    from public.toilets t
    join public.profiles p on p.facility_id = t.facility_id or p.role = 'admin'
    where t.id = toilet_units.toilet_id and p.id = auth.uid()
  )
);

-- QR codes read access
drop policy if exists "qr codes read" on public.qr_codes;
create policy "qr codes read"
on public.qr_codes for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or p.facility_id = qr_codes.facility_id
      )
  )
);

-- Maintenance issues read access
drop policy if exists "maintenance read" on public.maintenance_issues;
create policy "maintenance read"
on public.maintenance_issues for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or p.facility_id = maintenance_issues.facility_id
      )
  )
);

-- Audit logs read access (Admin only, or facility specific)
drop policy if exists "audit logs read" on public.audit_logs;
create policy "audit logs read"
on public.audit_logs for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role = 'admin'
        or (p.facility_id = audit_logs.facility_id and p.role = 'supervisor')
      )
  )
);


-- 6. RPC Function for atomic toilet creation
create or replace function public.create_toilet_with_qr(
  p_facility_id uuid,
  p_building text,
  p_floor text,
  p_area text,
  p_name text,
  p_toilet_type text,
  p_num_units int,
  p_cleaning_interval_minutes int,
  p_actor_id uuid,
  p_public_app_url text
) returns jsonb
language plpgsql security definer
as $$
declare
  v_facility_code text;
  v_lock_id bigint;
  v_max_seq int := 0;
  v_next_seq int;
  v_new_toilet_code text;
  v_new_toilet_id uuid;
  v_unit_code text;
  v_target_url text;
  v_qr_id uuid;
  v_i int;
begin
  -- 1. Validate facility and get code
  select code into v_facility_code from public.facilities where id = p_facility_id;
  if not found then
    raise exception 'Facility not found';
  end if;

  -- 2. Acquire advisory lock based on facility_id hash
  v_lock_id := ('x' || substr(md5(p_facility_id::text), 1, 16))::bit(64)::bigint;
  perform pg_advisory_xact_lock(v_lock_id);

  -- 3. Determine highest existing sequence
  select coalesce(max(
    substring(code from char_length(v_facility_code) + 3)::int
  ), 0)
  into v_max_seq
  from public.toilets
  where facility_id = p_facility_id
    and code like (v_facility_code || '-T%')
    and substring(code from char_length(v_facility_code) + 3) ~ '^[0-9]+$';

  v_next_seq := v_max_seq + 1;
  v_new_toilet_code := v_facility_code || '-T' || lpad(v_next_seq::text, 3, '0');

  -- 4. Insert toilet
  insert into public.toilets (
    facility_id, code, name, building, floor, area, status, cleaning_interval_minutes
  ) values (
    p_facility_id, v_new_toilet_code, p_name, p_building, p_floor, p_area, 'NOT_CLEANED', p_cleaning_interval_minutes
  ) returning id into v_new_toilet_id;

  -- 5. Generate internal units
  if p_num_units > 0 then
    for v_i in 1..p_num_units loop
      v_unit_code := v_new_toilet_code || '-U' || lpad(v_i::text, 2, '0');
      insert into public.toilet_units (
        toilet_id, unit_code, unit_no
      ) values (
        v_new_toilet_id, v_unit_code, v_i
      );
    end loop;
  end if;

  -- 6. Generate QR metadata
  v_target_url := p_public_app_url || '/t/' || v_new_toilet_code;
  insert into public.qr_codes (
    facility_id, toilet_id, qr_code, target_url
  ) values (
    p_facility_id, v_new_toilet_id, v_new_toilet_code, v_target_url
  ) returning id into v_qr_id;

  -- 7. Audit log
  insert into public.audit_logs (
    facility_id, actor_id, actor_type, action, entity_type, entity_id, new_data
  ) values (
    p_facility_id, p_actor_id, 'USER', 'TOILET_CREATED', 'TOILET', v_new_toilet_id,
    jsonb_build_object(
      'code', v_new_toilet_code,
      'name', p_name,
      'units', p_num_units
    )
  );

  return jsonb_build_object(
    'toilet_id', v_new_toilet_id,
    'toilet_code', v_new_toilet_code,
    'qr_id', v_qr_id,
    'target_url', v_target_url
  );
end;
$$;

-- 7. RPC Function for non-blocking QR scan tracking
create or replace function public.increment_qr_scan(p_toilet_code text)
returns void language plpgsql security definer as $$
begin
  update public.qr_codes
  set scan_count = scan_count + 1,
      last_scanned_at = now()
  where qr_code = p_toilet_code;
end;
$$;
