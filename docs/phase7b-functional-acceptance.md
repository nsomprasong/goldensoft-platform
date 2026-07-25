# Phase 7B Functional Acceptance

Date: 2026-07-25
Updated: 2026-07-25 (Phase 7C follow-up)
Environment: local development (`goldensoft-platform`)
AUTH_INVITE_MODE: unchanged (read-only in Settings)

## Verification commands (agent-run)

| Command | Result |
|---|---|
| `npm test` | PASS (292) |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run db:preflight` | PASS |
| `npm run db:verify` | PASS (51 tables + migration 0005) |
| `npm run db:migration:check` | PASS (0001–0005) |
| `SEED_MODE=system npm run seed:phase7` | PASS (idempotent ×2 in 7C) |

## Browser acceptance status

Phase 7B originally documented checklist-only readiness.
**Phase 7C executed real browser/API acceptance** — see `docs/phase7c-final-acceptance.md`.

### Classification

| Flow | Phase 7B | Phase 7C |
|---|---|---|
| SUPER_ADMIN product/plan/subscription lifecycle | Planned / Ready | **Browser verified** |
| Subscription domain history | Planned (audit fallback) | **Browser verified** (table + UI) |
| Custom roles / effective permissions | Ready | **API verified** + UI present |
| OWNER product manage denied | Ready | **API verified** + browser redirect/deny |
| Demo seed / cleanup | Automated | Unchanged |

## Migration 0005

Applied in Phase 7C after additive safety review.

- Tables: `subscription_change_types`, `subscription_histories`
- No fake backfill of historical events

## Demo dataset

- Orgs: `RESORT-DEMO`, `COMPANY-DEMO`, `STATION-DEMO`
- Marker: `ข้อมูลตัวอย่าง` / `DEMO-`
- No real Auth users, no real invites from demo seed
- Production demo seed blocked

## Known gaps carried into 7C (addressed or documented)

- Branch scope UI: completed in 7C
- Plan feature matrix: completed in 7C
- Real performance numbers: measured in 7C (`docs/PERFORMANCE_BENCHMARK.md`)
