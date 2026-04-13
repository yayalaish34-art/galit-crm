# Galit CRM — Deployment Readiness Summary

## 1. Repository Structure

```
galit-crm/
├── apps/
│   ├── api/          ← NestJS backend (→ Railway)
│   │   ├── Dockerfile        ✅ CREATED
│   │   ├── .dockerignore     ✅ CREATED
│   │   ├── prisma/
│   │   │   ├── schema.prisma (1028 lines, PostgreSQL)
│   │   │   ├── migrations/   (31 migrations)
│   │   │   └── seed-*.ts     (3 seed files)
│   │   └── src/              (29 modules)
│   └── web/          ← Next.js frontend (→ Vercel)
│       └── app/
├── docker-compose.yml (local dev: postgres:15 + redis:7)
├── vercel.json        ✅ EXISTS
├── .gitignore         ✅ UPDATED
└── DEPLOYMENT-READY.md (this file)
```

## 2. Git Status — Files to Commit

**Modified (~100+ files):** All source code across apps/api and apps/web — safe to commit.

**New files to commit:**
- `.gitignore`
- `apps/api/Dockerfile`
- `apps/api/.dockerignore`
- `apps/api/prisma/migrations/` (31 migration directories)
- `apps/api/prisma/seed-*.ts` (3 seed files)
- New API modules: events-history, execution-calendar, inquiries, orders, payment-terms, sales-calendar, transactions, interactions, quotes, tasks
- `apps/api/src/assets/`

**Needs user decision:**
- `apps/api/scripts/repro-*.json` — debug/repro files. Recommend adding to `.gitignore`.

**Properly ignored:** `_backups/`, `node_modules/`, `.next/`, `dist/`, `.env*`, `*.bat`, `do`

## 3. Environment Variables

### Railway (apps/api) — Required

| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Railway Postgres plugin | `postgresql://user:pass@host:port/db` — auto-injected by Railway Postgres addon |
| `PORT` | Railway | Auto-injected by Railway (default fallback: 3001) |

### Railway (apps/api) — Optional

| Variable | Source | Notes |
|----------|--------|-------|
| `CORS_ORIGIN` | Manual | Comma-separated origins, e.g. `https://galit-crm.vercel.app` — code already allows all `*.vercel.app` domains, so this is optional |
| `IMPORT_STORAGE_DIR` | Manual | Only if using legacy import feature; defaults to `data/imports` |

### Vercel (apps/web) — Required

| Variable | Source | Notes |
|----------|--------|-------|
| `NEXT_PUBLIC_API_URL` | Manual | Railway API URL, e.g. `https://galit-crm-api.up.railway.app` — **must be set at BUILD TIME** (Next.js inlines it) |

### NOT Currently Used (dependencies exist but no code references)

- `JWT_SECRET` — @nestjs/jwt is in package.json but not imported in any module
- `REDIS_URL` — redis + bullmq in package.json but not used in AppModule
- These can be configured later when auth/queue features are built

## 4. Prisma & Database Readiness

- **Provider:** PostgreSQL (via `@prisma/adapter-pg` with `pg` Pool)
- **Schema:** 1028 lines, no hardcoded URL (uses `DATABASE_URL` from env)
- **Prisma config:** `prisma.config.ts` using Prisma 7 `defineConfig` pattern
- **Migrations:** 31 migrations, all sequential from 2026-03-12 to 2026-03-28
- **Migration lock:** Present and valid (`provider = "postgresql"`)
- **Dockerfile CMD:** Runs `prisma migrate deploy` before `node dist/main`

## 5. Deployment Commands

### Railway (Backend API)

**Setup:**
1. Create new Railway project
2. Add PostgreSQL plugin → copies `DATABASE_URL` automatically
3. Connect GitHub repo
4. Set root directory: `apps/api`
5. Railway auto-detects Dockerfile

**Environment variables to set manually:**
```
CORS_ORIGIN=https://galit-crm.vercel.app
```

**Build & start are handled by Dockerfile:**
```dockerfile
# Build:  prisma generate && nest build
# Start:  prisma migrate deploy && node dist/main
```

### Vercel (Frontend Web)

**Setup:**
1. Import GitHub repo to Vercel
2. Framework preset: Next.js
3. Root directory: `apps/web`
4. vercel.json already configured

**Environment variables to set:**
```
NEXT_PUBLIC_API_URL=https://<your-railway-api-domain>.up.railway.app
```

**Build command (auto from package.json):**
```
next build
```

## 6. Deployment Order

1. **Push to GitHub** — `git add . && git commit && git push`
2. **Deploy Railway FIRST** — backend must be live before frontend builds (Vercel inlines the API URL at build time)
3. **Copy Railway domain** — from Railway dashboard after deploy
4. **Set `NEXT_PUBLIC_API_URL`** on Vercel with the Railway domain
5. **Deploy Vercel** — trigger build (or auto-deploys on push)
6. **Verify** — open Vercel URL, check network tab for API calls hitting Railway

## 7. Warnings & Notes

- **No root `package.json`** — this is fine for Railway/Vercel since both point to subdirectory roots
- **No authentication middleware yet** — JWT/auth is partially scaffolded (AuthModule exists with bcrypt login) but no JWT token verification middleware. All API endpoints are currently open.
- **Redis/BullMQ unused** — listed as dependencies but not imported. Docker-compose runs Redis for local dev but the API doesn't connect to it. Can be removed from docker-compose or configured later.
- **`apps/api/storage/`** — gitignored, used for file uploads. On Railway, this is ephemeral (lost on redeploy). Consider S3/Cloudflare R2 for persistent file storage.
- **Prisma adapter** — uses `@prisma/adapter-pg` (driver adapter pattern), not the default Prisma engine. This is compatible with Railway PostgreSQL.
