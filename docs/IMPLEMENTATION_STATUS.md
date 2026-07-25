# Implementation Status — Phase 2 MVP Foundation

## Completed

- Next.js 15 + React 19 + TypeScript strict + Tailwind 4 project scaffold
- Environment Guard (`APP_CODE`, expected/blocked Supabase project ref)
- Prisma schema สำหรับ Platform MVP models (SQLite test provider)
- Central auth/session helpers + test auth header
- ApplicationContext resolver (membership, branch scope, product membership, subscription, entitlement snapshot)
- Organization bootstrap (transaction + idempotency + OWNER + audit + outbox)
- Last-OWNER revoke protection
- Subscription create with immutable JSON snapshot
- API MVP: health, auth/me, context, organizations, branches, products, subscriptions
- Basic UI pages: login placeholder, dashboard, orgs, branches, products, plans, subscriptions
- Seed data script (orgs, branches, products, HR plans, users)
- Tenant isolation + env guard + legacy untouched tests
- Docs: README, ENVIRONMENT_SETUP, IMPLEMENTATION_STATUS, TEST_RESULTS

## Not Implemented

- Real Supabase Auth UI wiring / production login
- Prisma migrations against Supabase PostgreSQL
- `subscription_items` table (reserved conceptually; overrides present)
- Outbox consumer workers
- Automated billing / payment gateway
- QR device credentials
- RLS policies on PostgreSQL
- Deploy / CI pipeline

## Known Risks

- Local schema uses SQLite — PostgreSQL enum/partial-unique differences ต้องตรวจตอนย้าย
- `auth.users` FK (D105) ยังไม่ใส่ใน SQLite test schema (soft unique `authUserId`)
- UI pages อ่าน DB โดยตรงสำหรับ demo — production ควรผ่าน API + authz เสมอ
- `ALLOW_TEST_AUTH` อันตรายถ้าเปิดใน production

## Test Results

ดู `docs/TEST_RESULTS.md` — prisma validate/generate, seed, 9/9 tests, typecheck, lint, production build **PASS** (SQLite local)

## Next Recommended Step

1. สร้าง Supabase Project ใหม่ (Central Auth)
2. สลับ Prisma datasource เป็น PostgreSQL + ใส่ FK `user_profiles.auth_user_id → auth.users`
3. รัน migration บน project ใหม่เท่านั้น พร้อม Environment Guard
4. เชื่อม Login UI กับ Supabase Auth
