# BMC CleanPulse — Direct Open Project

This project is ready to open as one folder in **VS Code** or **Antigravity**.

## Stack

- React + Vite
- Node.js + Fastify
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Realtime
- Framer Motion animations

## What is included

### Cleaner / QR flow
`/t/BDBA-T001`

Scan QR → select cleaner → PIN → start cleaning → photo + selfie → complete.

Any authorized cleaner in the facility can clean any toilet.

### Supervisor
`/`

Simple operational view:
- Not cleaned
- Overdue
- Cleaning now
- Clean
- Repair
- Longest waiting toilet first

## STEP 1 — Open project

Unzip this file.

Open the folder:

`CleanPulse-DirectOpen`

in VS Code or Antigravity.

## STEP 2 — Install Node.js

Use Node.js 20+.

Check:

```bash
node -v
npm -v
```

## STEP 3 — Install everything

From the PROJECT ROOT:

```bash
npm install
```

Because the project uses npm workspaces, this installs frontend + backend.

## STEP 4 — Create Supabase project

Create a Supabase project.

Open Supabase SQL Editor.

Run:

1. `supabase/schema.sql`
2. `supabase/migrations/001_admin_qr_system.sql`
3. optionally `supabase/demo-seed.sql`

## STEP 5 — Create private Storage bucket

In Supabase:

Storage → New Bucket

Name:

`cleaning-evidence`

Keep it PRIVATE.

## STEP 6 — Backend environment

Copy:

`backend/.env.example`

to:

`backend/.env`

Fill:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- CLEANER_JWT_SECRET

IMPORTANT:
Never put `SUPABASE_SERVICE_ROLE_KEY` in React/frontend.

## STEP 7 — Frontend environment

Copy:

`frontend/.env.example`

to:

`frontend/.env`

Fill:

- VITE_API_URL
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

For local development:

`VITE_API_URL=http://localhost:8787`

## STEP 8 — Create Supervisor Login

Supabase → Authentication → Users → Add user.

Copy the user's UUID.

Then insert profile:

```sql
insert into public.profiles
(id,facility_id,full_name,role)
select
  'PASTE_AUTH_USER_UUID',
  id,
  'Supervisor Name',
  'supervisor'
from public.facilities
where code='BDBA';
```

## STEP 9 — Add cleaner

Generate PIN hash:

```bash
npm run hash-pin -w backend -- 1103
```

Copy the resulting bcrypt hash.

Then:

```sql
insert into public.cleaners
(facility_id,full_name,pin_hash)
select
  id,
  'Meena',
  'PASTE_BCRYPT_HASH'
from public.facilities
where code='BDBA';
```

## STEP 10 — Run everything

From the ROOT folder:

```bash
npm run dev
```

This starts:

Frontend:
http://localhost:5173

Backend:
http://localhost:8787

Health:
http://localhost:8787/health

Test QR:
http://localhost:5173/t/BDBA-T001

## VS Code

You can also use:

Terminal → Run Task → `CleanPulse: Install`

and:

Terminal → Run Task → `CleanPulse: Run Full Stack`

## Production note

This is a strong production-oriented starter, but before city-scale deployment add:
- Admin facility onboarding UI
- QR generation centre
- maintenance workflow
- audit event table
- supervisor approve/reject
- offline PWA
- image validation/compression
- signed evidence viewer
- automated tests
- central BMC dashboard
- monitoring/backups

## Admin & QR System Update

This project now includes a complete Admin & QR Management system built directly into CleanPulse!

### Database Migration
Before testing the new Admin features, you MUST apply the migration:
1. Open the Supabase SQL Editor in your project.
2. Open `supabase/migrations/001_admin_qr_system.sql`.
3. Run the complete file. 
*(This adds `toilet_units`, `qr_codes`, `maintenance_issues`, `audit_logs` and atomic RPC functions while safely preserving all existing data).*

### Make an Admin User for Testing
Since existing Supervisors remain Supervisors, you must manually upgrade your test account:
1. Open Supabase SQL Editor.
2. Run: 
   ```sql
   update public.profiles set role = 'admin' where id = 'YOUR_USER_UUID';
   ```

### Testing QR Centre
1. Navigate to `http://localhost:5173/admin`
2. Create a new Facility (e.g. `KEM`).
3. Select `KEM` and click **+ Add Toilet**. Create a toilet with 5 units.
4. Go to **QR Centre** -> filter by `KEM`.
5. You will see the new QR. You can **Download PNG** or click **Print All** to view the physical sticker print layout.
6. Open `http://localhost:5173/t/KEM-T001` to view the public page.

### Testing
Backend tests are provided using Vitest.
To run backend tests (Requires the migration to be applied first):
```bash
cd backend
npm run test
```
