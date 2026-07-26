# Performance Benchmark — Platform Admin

Updated: 2026-07-25 (Phase 7C measured)

## Planned targets

- Warm client/application navigation: under **2 seconds** of app work (excluding cold compile)
- Prefer `Promise.all` for independent queries
- Bound list queries (`take`)
- Avoid N+1 on history / role option loads
- Do **not** remove auth/permission checks for speed

## Automated / measured (Phase 7C)

Measured with `scripts/phase7c-perf.ts` against local Next.js 15.5.3 turbopack dev on `http://127.0.0.1:3000` using test-auth headers.

| Route | Cold ms | Warm ms |
|---|---:|---:|
| `/` | 130 | 250 |
| `/organizations` | 135 | 128 |
| `/users` | 130 | 132 |
| `/roles` | 130 | 178 |
| `/products` | 131 | 123 |
| `/plans` | 125 | 147 |
| `/subscriptions` | 129 | 138 |
| `/subscriptions/[id]` | — | 146 |
| DB `subscriptions` + `subscription_histories` count | — | 211 |

Notes:
- Cold times above were taken after the server was already warm from prior acceptance traffic; true first-compile cold can be multi-second.
- Warm samples are **under 2s**.
- Production `next start` timings were not re-measured in this run (document as **Manually unverified** for production SSR until measured).

## Design mitigations present in code

- `requirePlatformPage` / `getAuthUser` request-scoped `cache()`
- Dashboard independent counts via `Promise.all`
- Subscription history query limited (`take` ≤ 100) with indexes from migration 0005
- Profile role/branch options batched per page

## Phase 8B.4 Billing (measured)

Measured 2026-07-26 with `scripts/phase8b4-perf.ts` against local turbopack `next dev` using test-auth headers (SUPER_ADMIN) and `COMPANY-DEMO` context. Warm = best of 3 samples after a prime navigation.

| Route | Warm ms | Under 2s |
|---|---:|:---:|
| platform `/billing` | 771 | yes |
| platform `/billing/[org]` | 991 | yes |
| customer `/account` | 673 | yes |
| customer `/account/products` | 682 | yes |
| customer `/account/credit` | 661 | yes |
| customer `/account/invoices` | 729 | yes |
| customer `/account/payments` | 656 | yes |
| customer invoice detail | 669 | yes |
| customer payment detail | 734 | yes |

Design notes:

- Customer bootstrap does not load full invoice/payment detail trees
- Credit/invoice/payment lists are bounded (`take` ≤ 100; admin org page `take` 20)
- Balance uses snapshot column (not full ledger sum per request)
- Org billing page loads summary/ledger/invoices/payments/contacts via `Promise.all`
- Reconciliation is CLI-only (`billing:reconcile`), not page request
- Ledger/invoice/payment indexes from migration 0006

Classification: **Browser verified**

