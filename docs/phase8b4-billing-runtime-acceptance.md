# Phase 8B.4 — Billing Runtime Acceptance

Date: 2026-07-26  
Scope: apply migration `0006_billing_credit_foundation`, seeds, service/runtime acceptance, Platform Admin + Customer App visibility.  
No Payment Gateway. No real payment execution. `AUTH_INVITE_MODE=mock` unchanged. No Git push. No Legacy edits.

## 1. Safety review (0006)

- Platform schema only, additive `CREATE TABLE` / indexes / FKs
- No `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / broad `DELETE`/`UPDATE`
- No PostgreSQL enums
- Does not touch `auth`, `hr`, `resident_v2`, `qrstation`
- Masters immutable by code uniqueness; money `Decimal(18,2)`; currency default `THB`
- Idempotency partial unique index on credit transactions
- One active primary billing contact partial unique index
- Indexes for org/account/status/dates
- Ledger append-only at service layer (`FOR UPDATE` on account)

**Verdict:** safe to apply (approved).

## 2. Migration state

| Checkpoint | Result |
|---|---|
| Before | **A = NOT_APPLIED** (51 platform tables; billing-related only `billing_cycles`) |
| Apply | `npx prisma migrate deploy` → `0006_billing_credit_foundation` success |
| After | **up to date**; **64** platform tables; **13** billing tables |
| Failed migrations | none unresolved for 0006 |
| `db:verify` | PASS (expectation raised 51→64 + billing masters/tables) |

## 3. Seeds

| Seed | Mode | Runs | Result |
|---|---|---|---|
| `seed:billing-catalog` | `system` | ×2 | masters 32, billing permissions 12; idempotent |
| `seed:billing-demo` | `development-demo` | ×2 | COMPANY/RESORT/STATION-DEMO only; idempotent |

Guards: production demo seed refused; GOLDENSOFT never touched; no Auth invite; no gateway.

## 4. Runtime acceptance (`npm run acceptance:billing-runtime`)

**35/35 PASS** on `COMPANY-DEMO`:

- Credit: create account, unique org, credit/debit, negative rejected, idempotency, snapshot, reversal, concurrent dual adjust (row lock), unauthorized denied, cross-tenant denied
- Invoice: draft/edit/issue, issued immutable, concurrent invoice numbers, void rules, overdue reconcile
- Payment: PENDING no side-effects, confirm + idempotent reconfirm, partial/full allocate, over-allocation rejected, PROMPTPAY/CARD rejected
- Contacts: create/edit/deactivate/set primary (one active primary), email validation, cross-tenant denied

## 5. Concurrent adjustment

Two parallel `adjustCredit` (+10 / +15) with account `FOR UPDATE`: final balance correct; distinct ledger rows.

## 6. Reconciliation (`npm run billing:reconcile`)

Read-only. Exit 0 when clean.

Example run after acceptance:

```json
{ "ok": true, "accounts": 3, "invoices": 9, "payments": 6, "findings": [], "errorCount": 0 }
```

No auto-fix in this phase.

## 7. API contract

`POST /api/platform/billing` uses typed action union + Zod schemas + permission map + exhaustive switch. Responses `{ ok, action, result }` / `{ ok:false, code, message }`. Forwards `idempotencyKey` on credit adjust.

## 8. Browser / responsive / performance

See companion Customer doc and `PERFORMANCE_BENCHMARK.md` Phase 8B.4 section. Scripts:

- `npm run acceptance:phase8b4`
- `npm run perf:phase8b4`

## 9. Known limitations

- Credit ledger has no DB trigger blocking direct SQL update/delete (service has no mutate API; append-only by convention)
- Platform Admin billing mutations are API-driven; page is read/summary UI
- No PromptPay/Card/webhook/gateway
- Confirm payment is idempotent only when already `CONFIRMED`

## 10. Confirmations

- No Payment Gateway
- No real payment execution
- No production demo seed
- `AUTH_INVITE_MODE=mock`
- Legacy untouched
- No destructive DB reset / `db push`
- No Git push
