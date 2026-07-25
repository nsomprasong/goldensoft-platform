# Phase 7B Functional Acceptance

Date: 2026-07-25  
Environment: local development (`goldensoft-platform`)  
AUTH_INVITE_MODE: unchanged (read-only in Settings)

## Verification commands (agent-run)

| Command | Result |
|---|---|
| `npm test` | PASS (292) |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run db:preflight` | PASS |
| `npm run db:verify` | PASS (49 tables + 0004) |
| `npm run db:migration:check` | PASS (0001–0005) |
| `SEED_MODE=system npm run seed:phase7` | PASS |
| `SEED_MODE=development-demo npm run seed:demo` | PASS |
| `npm run seed:demo:cleanup -- --dry-run` | PASS |

## Browser / route acceptance checklist

Automated UI browser session was not available in this agent turn; acceptance below is based on **built routes + API surface + server permission gates** and should be re-confirmed in a logged-in browser session.

### SUPER_ADMIN

| # | Flow | Evidence | Status |
|---|---|---|---|
| 1 | Login | `/login` unchanged | Ready |
| 2 | Platform admin mode | context cookie `platform_admin` | Ready |
| 3 | See all organizations | org list + dashboard all-org scope | Ready |
| 4–6 | Product create/edit/activate | `/products`, `/products/new`, `/products/[id]`, APIs | Ready |
| 7–8 | Plan create/edit/duplicate version | `/plans*`, plan APIs | Ready |
| 9–12 | Subscription trial/activate/suspend/resume/change plan | `/subscriptions*`, actions API | Ready |
| 13 | View entitlements | subscription detail + org detail section | Ready |
| 14–16 | Custom role + assign | `/roles*`, `/users/profiles/[id]` | Ready |
| 17 | Effective permissions | `resolveEffectivePermissions` on profile page | Ready |
| 18 | Revoke role | `RoleRevokeButton` → memberships/roles DELETE | Ready |
| 19 | Audit logs | `/audit-logs` + mutation audits | Ready |
| 20 | Switch organization | context switcher | Ready |

### OWNER

| Flow | Expected | Status |
|---|---|---|
| Own org only | membership scope on lists/APIs | Ready |
| Custom roles | `role.manage` for OWNER | Ready |
| Assign roles | `role.assign` | Ready |
| Product/plan manage | OWNER has read only (no manage) | Ready |

### Ordinary user

| Flow | Expected | Status |
|---|---|---|
| Nav by permission | existing PLATFORM_NAV filter | Ready |
| Cross-tenant API | 403 via actor membership checks | Ready |
| Direct URL | AccessDenied / 403 patterns | Ready |

## Demo dataset

- Orgs: `RESORT-DEMO`, `COMPANY-DEMO`, `STATION-DEMO`
- Marker: `ข้อมูลตัวอย่าง` / `DEMO-` taxId / address
- No real Auth users, no real invites (`example.invalid` + `DEMO_MOCK_NO_SEND`)
- Cleanup dry-run lists counts only; production blocked

## Migration awaiting approval

`prisma/migrations/0005_phase7b_subscription_history/migration.sql`

- Additive only (subscription change types + histories + audit action codes)
- **Not applied**
- Lifecycle history currently served from `audit_logs` until 0005 is approved

## Performance notes

- Warm navigation target: avoid 5s app-query waits (compile time excluded)
- List queries bounded (`take: 100` / `50` / `200`)
- Profile role options loaded in one batched query
- Dashboard uses `Promise.all` for independent counts
- Middleware still session/routing only

## Remaining gaps (honest)

1. Full interactive browser click-through not executed in this agent session — confirm in browser after login.
2. Subscription first-class history table waits on migration 0005 approval.
3. Branch assign/remove UI on profile page is display-only (role assign/revoke implemented; branch scope mutation UI still limited).
4. Plan feature/limit editor UI is minimal (create supports empty features; limits come from published versions / defaults).
