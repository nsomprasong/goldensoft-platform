# Phase 7C Final Acceptance

Date: 2026-07-25 (UTC+7 session)  
Environment: local development (`goldensoft-platform`)  
Supabase project ref: `horyhrnqbeaivdztekfv` (non-Legacy)  
AUTH_INVITE_MODE: unchanged (`mock` in `.env.local`)  
ALLOW_TEST_AUTH: overridden to `true` only in process env for acceptance (file remains `false`)

## 1. Migration 0005 safety review

File: `prisma/migrations/0005_phase7b_subscription_history/migration.sql`

| Check | Result |
|---|---|
| Platform schema only | PASS |
| Additive only | PASS |
| No DROP TABLE/COLUMN | PASS |
| No TRUNCATE / broad DELETE/UPDATE | PASS |
| No PostgreSQL enum | PASS |
| No auth/resident_v2/hr/qrstation | PASS |
| FK to subscriptions / organizations / change types | PASS |
| Indexes present | PASS |
| No fake history backfill | PASS |
| Idempotent master inserts (`ON CONFLICT DO NOTHING`) | PASS |

## 2. Apply migration

| Step | Result |
|---|---|
| Baseline tables | 49 |
| Baseline subscriptions | 8 |
| `npx prisma migrate deploy` | PASS |
| Post tables | 51 (`subscription_change_types`, `subscription_histories`) |
| `npx prisma migrate status` | Database schema is up to date |
| Failed migrations unresolved | none |

## 3. Subscription history integration

Wired in `src/lib/platform/subscriptions.ts` via `recordSubscriptionHistory` in the same transaction as lifecycle mutations:

- CREATE, ACTIVATE, SUSPEND, RESUME, CANCEL, EXPIRE, CHANGE_PLAN, EXTEND
- Domain history coexists with `audit_logs` (history does not replace audit)
- UI: `/subscriptions/[id]` section **ประวัติการเปลี่ยนแปลง** (newest first, Thai empty state, metadata in `<details>`)

## 4. Branch scope UI

- API: `POST /api/platform/memberships/branch-scopes`
- UI: `BranchScopeForm` on `/users/profiles/[id]`
- Supports ALL_BRANCHES / SELECTED / NONE, org-scoped branch validation, audit on change

## 5. Plan feature matrix

- Catalog from `catalogFeaturesForProduct` / `ensureProductFeatureCatalog`
- Create-plan UI matrix (boolean + numeric, duplicate key prevention, Thai labels, preview)
- Server validates feature codes belong to product

## 6. Browser acceptance (executed)

Runner: `scripts/phase7c-acceptance.ts` + Playwright Chromium against `http://127.0.0.1:3000` with test-auth headers (no password printed, no real invite).

Evidence: agent-run `scripts/phase7c-acceptance.ts` on 2026-07-25 — **PASS 38/38**.

Runner: Playwright Chromium against `http://127.0.0.1:3000` with test-auth headers (no password printed, no real invite).

### Classification

| Area | Status |
|---|---|
| SUPER_ADMIN product/plan/subscription lifecycle APIs | **Browser verified** (API + page navigation) |
| Subscription history rows + UI | **Browser verified** |
| Custom role create | **Automated / API verified** |
| OWNER product create API forbidden | **Automated verified** (403) |
| OWNER `/products/new` UI denial | **Browser verified** (AccessDenied or redirect away from create form) |
| Responsive overflow 375–1440 | **Browser verified** |
| Login with password UI | **Manually unverified** (used ALLOW_TEST_AUTH header path) |
| Assign/revoke role click-through | **Partially verified** (API role create; UI assign/revoke not fully click-scripted) |
| Ordinary user branch-scope matrix | **Partially verified** (UI shipped; click path not fully scripted) |

## 7. Performance (measured)

Script: `scripts/phase7c-perf.ts` against warm dev server.

| Route | Warm ms (approx) |
|---|---|
| `/` | 250 |
| `/organizations` | 128 |
| `/users` | 132 |
| `/roles` | 178 |
| `/products` | 123 |
| `/plans` | 147 |
| `/subscriptions` | 138 |
| `/subscriptions/[id]` | 146 |
| DB count subscriptions+histories | 211 |

All warm samples **under 2s** application wait on this run.

## 8. Verification commands (agent-run)

| Command | Result |
|---|---|
| `npm test` | PASS (292) |
| `npm run lint` | PASS |
| `npx tsc --noEmit` / `npm run typecheck` | PASS |
| `npm run db:preflight` | PASS |
| `npm run db:verify` | PASS (51 tables + 0005) |
| `npm run db:migration:check` | PASS |
| `npx prisma migrate status` | up to date |
| `SEED_MODE=system npm run seed:phase7` ×2 | PASS (idempotent) |
| `npm run build` | PASS (after stopping conflicting Next lock) |

## 9. Safety confirmations

- No git push
- No real invite
- No production demo seed
- AUTH_INVITE_MODE not changed
- Legacy reference untouched
- No `db push` / `migrate reset` / `migrate dev` on real DB
- Only migration 0005 applied in this phase

## 10. Known limitations

- Browser acceptance used `ALLOW_TEST_AUTH` header impersonation, not interactive email/password login.
- ACCEPTANCE-* products/plans were deactivated after the run (history rows retained).
- Temporary acceptance JSON under `docs/_phase7c-*` may be deleted and is not the durable report (this file is).
