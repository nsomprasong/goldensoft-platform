# Phase 7B Performance Notes

Measured against application query design (dev compile time excluded).

## Guarantees in code

| Area | Guard |
|---|---|
| Dashboard | `Promise.all` independent counts; org-scoped vs platform_admin |
| Products/Plans/Subscriptions lists | `take` bounded (100) |
| Users | `take: 50` |
| Org detail | branches `take: 200`, subscriptions `take: 50` |
| User profile roles | single batched `organizationRole.findMany` |
| Middleware | session refresh + routing only; static assets excluded |
| Auth/context | React `cache()` request-scoped |

## Warm navigation target

Application queries for warm admin list/detail pages should not wait ~5 seconds from DB/auth alone. Remaining multi-second delays in local `next dev` are typically Turbopack compile, not query time.

## Before / after (Phase 7B)

| Route | Before | After |
|---|---|---|
| `/products` | read-only unbounded list | permission-gated, searchable, `take: 100`, CRUD |
| `/plans` | read-only | permission-gated filters + CRUD |
| `/subscriptions` | read-only | lifecycle actions + detail snapshots |
| `/users/profiles/[id]` | n/a | batched role options + effective permissions |
| Dashboard | all-org for SUPER_ADMIN only | platform_admin = all; membership/org mode scoped |

Re-measure cold/warm timings in browser Network + server `PERF_LOG` when validating locally.
