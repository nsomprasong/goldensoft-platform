# Implementation Status

## Completed

### Phase 2
- Next.js MVP, APIs, ApplicationContext, seed design, UI shells, tenant helper tests

### Phase 3
- Prisma datasource → PostgreSQL with `schemas = ["platform"]`
- All models/enums tagged `@@schema("platform")`
- JSONB subscription snapshot, timestamptz, Decimal money fields
- `@prisma/adapter-pg` + `pg` runtime singleton
- `prisma.config.ts` loads `.env.local` / `.env`; CLI uses `DIRECT_URL`
- Environment Guard: API + DATABASE_URL + DIRECT_URL refs, Legacy block, prod test-auth ban
- Auth vars: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server-only admin module)
- Initial migration SQL preview: `prisma/migrations/0001_platform_initial/migration.sql`
- `npm run db:migration:check`, `npm run db:preflight` (preflight needs real `.env.local`)

## Not Implemented

- Apply migration to Supabase
- Live `db:preflight` against real project (รอ credentials ใน `.env.local`)
- Real Supabase Auth login UI / user provisioning
- FK จาก `platform.user_profiles.auth_user_id` → `auth.users` (เลี่ยงแตะ schema `auth` ใน initial migration)
- Outbox workers, billing, QR device credentials, deploy

## Known Risks

- Pooler username format ต้องเป็น `postgres.<project_ref>` เพื่อให้ guard parse ได้
- Initial migration ยังไม่สร้าง FK เข้า `auth` โดยเจตนา (schema boundary)
- Seed ต้องการ PostgreSQL หลัง migrate แล้วเท่านั้น

## Test Results

ดู `docs/TEST_RESULTS.md`

## Next Recommended Step

1. ผู้ใช้ใส่ Connection Strings + Keys ใน `.env.local`
2. รัน `npm run db:preflight`
3. PM อนุมัติ → Apply `0001_platform_initial`
4. เชื่อม Login UI กับ Supabase Auth
