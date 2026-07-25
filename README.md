# GoldenSoft Platform

Central Auth, multi-tenant control plane สำหรับ Resident V2, HR และ QR Station

## Stack

- Next.js 15 App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- Prisma ORM
- Supabase Auth (Central)
- SQLite สำหรับทดสอบท้องถิ่น (PostgreSQL/Supabase ในขั้นถัดไป)

## Quick start

```bash
cp .env.example .env.local
# ตั้งค่า APP_CODE, EXPECTED_SUPABASE_PROJECT_REF, BLOCKED_LEGACY_SUPABASE_PROJECT_REF
# DATABASE_URL=file:./dev.db สำหรับ local test เท่านั้น

npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit/integration tests (SQLite test DB) |
| `npm run db:validate` | Prisma validate |
| `npm run db:generate` | Prisma generate |
| `npm run preflight:env` | Environment guard |

## Safety

- ห้ามชี้ `DATABASE_URL` / Supabase URL ไป Legacy หรือ Production ใน Phase นี้
- Environment Guard จะหยุดแอป/seed หากเจอ Legacy project ref
- ห้าม commit `.env*` (ยกเว้น `.env.example`)

## Docs

- `docs/CENTRAL_AUTH_FOUNDATION.md`
- `docs/ADR-001-CENTRAL_AUTH_AND_TENANCY.md`
- `docs/PLATFORM_DATABASE_BLUEPRINT.md`
- `docs/ADR-002-PLATFORM_DATA_AND_ENTITLEMENTS.md`
- `docs/ENVIRONMENT_SETUP.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/TEST_RESULTS.md`
