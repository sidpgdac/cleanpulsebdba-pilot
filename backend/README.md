# CleanPulse Backend

Node.js + Fastify 5 backend API for BMC CleanPulse.

## What this does

- **Cleaner PIN auth** — rate-limited, bcrypt-verified, issues short-lived JWTs
- **Photo uploads** — MIME-validated uploads to Supabase Storage via service role
- **Admin API** — facilities, toilets, cleaners (server-side PIN hashing), sessions, analytics
- **Status cron** — auto-advances toilet statuses every 5 minutes
- **Marathi audio** — serves the cleaning instructions MP3
- **Health check** — `GET /health` for deployment platforms

## Setup

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLEANER_JWT_SECRET
npm install
npm run dev
```

## API Routes

### Public (no auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/api/public/toilets/:code` | Toilet info for QR scan |
| POST | `/api/public/feedback` | Citizen feedback (30/min rate limit) |
| GET | `/api/public/audio/instructions` | Marathi audio file |

### Cleaner (no auth — rate limited 10/min)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cleaner/list` | List cleaners for a toilet |
| POST | `/api/cleaner/start` | Verify PIN, start session, get cleaner JWT |
| POST | `/api/cleaner/complete` | Complete session with cleaner JWT |
| POST | `/api/cleaner/upload?token=...` | Upload photo (multipart, MIME-checked) |

### Admin (Supabase JWT required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/facilities` | List facilities |
| POST | `/api/admin/facilities` | Create facility (admin only) |
| PATCH | `/api/admin/facilities/:id` | Update facility (admin only) |
| POST | `/api/admin/toilets` | Create toilet + QR (admin only) |
| PATCH | `/api/admin/toilets/:id` | Update toilet (admin only) |
| GET | `/api/admin/cleaners` | List cleaners |
| POST | `/api/admin/cleaners` | Create cleaner — PIN hashed server-side (admin only) |
| PATCH | `/api/admin/cleaners/:id` | Update cleaner / reset PIN (admin only) |
| DELETE | `/api/admin/cleaners/:id` | Deactivate cleaner (admin only) |
| GET | `/api/admin/sessions` | Paginated cleaning sessions |
| GET | `/api/admin/complaints` | Paginated complaints |
| PATCH | `/api/admin/complaints/:id` | Resolve complaint |
| GET | `/api/admin/analytics` | KPI analytics |
| GET | `/api/admin/audit-logs` | Audit trail |

## Deployment (Railway)

1. Push to GitHub
2. Create a new Railway project → Deploy from GitHub
3. Set root directory to `backend/`
4. Set environment variables (from `.env.example`)
5. Railway will auto-detect Node.js and start `npm start`

The `railway.json` file configures the health check at `/health`.

## Tests

```bash
npm test
```

## Hash a cleaner PIN

```bash
npm run hash-pin -- 1234
```
