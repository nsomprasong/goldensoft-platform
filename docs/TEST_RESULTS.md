# Test Results — Phase 3

วันที่รัน: 2026-07-25  
Database target: PostgreSQL schema `platform` (migration **preview only**, not applied)

## Commands

| Command | Result |
|---------|--------|
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS |
| `npm run db:migration:check` | PASS (schemas touched: `platform`) |
| `npm test` | PASS (18/18) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `prisma migrate deploy` / `db push` | **NOT RUN** (by design) |
| `npm run db:preflight` | **NOT RUN** (รอ `.env.local` จริง) |

## Test suites

1. Environment Guard — Legacy block, URL mismatch, prod test-auth ban, publishable key
2. Tenant isolation helpers — branch scope, last OWNER, immutable snapshot
3. Migration SQL safety — platform-only DDL
4. Legacy untouched — Resident Legacy clean

## Notes

- Initial migration: `prisma/migrations/0001_platform_initial/migration.sql`
- ไม่เชื่อม Legacy / ไม่ Apply migration กับ Supabase
