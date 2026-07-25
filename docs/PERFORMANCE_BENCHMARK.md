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

## Classification legend

- **Planned** — design intent only
- **Automated test** — unit/integration asserts
- **Browser verified** — agent ran real timings
- **Manually unverified** — not measured yet
