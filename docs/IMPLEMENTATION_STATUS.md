# Implementation Status

## Architecture Rule

`GoldenSoft uses master tables instead of Prisma/PostgreSQL enums.`

## Completed

### Phase 2
- Next.js MVP, APIs, ApplicationContext, seed design, UI shells, tenant helper tests

### Phase 3
- Prisma datasource → PostgreSQL with `schemas = ["platform"]`
- All models tagged `@@schema("platform")`
- JSONB subscription snapshot, timestamptz, Decimal money fields
- `@prisma/adapter-pg` + `pg` runtime singleton
- `prisma.config.ts` loads `.env.local` / `.env`; CLI uses `DIRECT_URL`
- Environment Guard: API + DATABASE_URL + DIRECT_URL refs, Legacy block, prod test-auth ban
- Auth vars: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (server-only admin module)
- Initial migration SQL preview: `prisma/migrations/0001_platform_initial/migration.sql`
- `npm run db:migration:check`, `npm run db:preflight` (preflight needs real `.env.local`)

### Phase 3B — Enums → Master Tables
- Removed all Prisma `enum` declarations (17 former enums)
- Each status/type/role/cycle is a dedicated master model with FK from business tables
- Seed masters idempotent via `prisma/seed-masters.ts`
- Master service guards: code immutable when referenced, no delete for `isSystem` or referenced rows, inactive blocked for new writes
- Migration preview regenerated — no `CREATE TYPE` / `AS ENUM`

#### Enum → Master mapping

| Former Enum | Used on (examples) | Master Model | Seed codes |
|-------------|-------------------|--------------|------------|
| UserProfileStatus | UserProfile.status | UserProfileStatus | ACTIVE, DISABLED, PENDING |
| PlatformRole | PlatformRoleAssignment.role | PlatformRole | SUPER_ADMIN, SUPPORT, BILLING_ADMIN |
| AssignmentStatus | role assignments, overrides, scopes | AssignmentStatus | ACTIVE, REVOKED |
| OrganizationStatus | Organization.status | OrganizationStatus | ACTIVE, SUSPENDED, CLOSED |
| BranchStatus | Branch.status | BranchStatus | ACTIVE, INACTIVE |
| MembershipStatus | OrganizationMembership.status | MembershipStatus | INVITED, ACTIVE, SUSPENDED, REMOVED |
| OrganizationRole | OrganizationMembershipRole.role | OrganizationRole | OWNER, ADMIN, BILLING_CONTACT |
| BranchScopeType | OrganizationMembershipBranchScope.scopeType | BranchScopeType | ALL_BRANCHES, SELECTED, NONE |
| CatalogStatus | Product / Feature / Plan status | ProductStatus, FeatureStatus, PlanStatus | ACTIVE, RETIRED |
| PlanVersionStatus | PlanVersion.status | PlanVersionStatus | DRAFT, PUBLISHED, RETIRED |
| BillingCycle | PlanVersion default, Subscription | BillingCycle | MONTHLY, YEARLY, MANUAL |
| SubscriptionStatus | Subscription.status | SubscriptionStatus | TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED, EXPIRED |
| OverrideEffect | SubscriptionFeatureOverride | SubscriptionOverrideType | GRANT, REVOKE, LIMIT |
| ProductMembershipStatus | OrganizationProductMembership | ProductMembershipStatus | ACTIVE, SUSPENDED, REVOKED |
| OutboxStatus | OutboxEvent.status | OutboxEventStatus | PENDING, PROCESSING, PROCESSED, FAILED, DEAD |
| IdempotencyStatus | IdempotencyKey.status | IdempotencyStatus | IN_PROGRESS, COMPLETED, FAILED |
| MigrationStatus | LegacyIdentityMapping | LegacyMigrationStatus | PENDING, LINKED, MIGRATED, FAILED, IGNORED |

Additional masters (not former Prisma enums, but required as lookup): FeatureValueType (STRING, NUMBER, BOOLEAN), AuditActionType (action codes).

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
