# Platform Integration Contract v1

**Status:** Release baseline for Phase 8A  
**Audience:** Product apps (starting with GoldenSoft HR)  
**Platform tip (Phase 7C):** `1e4ec86`  
**Source of truth:** Platform server APIs + signed context cookie + Prisma `platform` schema  

This contract defines what product apps may rely on. Client-supplied roles, permissions, organization IDs, or entitlement flags are never authoritative.

---

## 1. Identity

| Concept | Contract |
|--------|----------|
| Auth principal | Supabase Auth user UUID (`auth.users.id`) |
| Platform profile | `platform.user_profiles.auth_user_id` soft-links to Auth UUID |
| Session owner | Supabase Auth cookie session via `@supabase/ssr` |
| Who refreshes session | Platform / product `middleware` calling Supabase SSR helpers |
| Token validation | Server uses `supabase.auth.getUser()` (or verified claims) — never trust client-only JWT decode for authorization decisions |
| Product soft reference | Product DBs may store `authUserId` as UUID text/uuid **without** FK to `auth.users` or `platform` |

Rules:

- Login identity is central (Supabase Auth).
- Business data for HR lives in the HR schema/repository, not in Platform tables.
- Products must fail closed when Auth/session cannot be verified.

---

## 2. Tenant Context

| Field | Meaning |
|------|---------|
| `organizationId` | Active organization UUID |
| `branchId` | Active branch UUID, or `null` = all branches the user is scoped to (not every org branch) |
| `mode` | `membership` (default) or `platform_admin` (SUPER_ADMIN operating without membership) |

### Cookie

- Name: `gs_platform_ctx`
- Format: signed HTTP-only cookie (`payload.signature`, HMAC-SHA256)
- Options: `httpOnly`, `sameSite=lax`, `secure` in production, path `/`
- Secret env: `PLATFORM_CONTEXT_COOKIE_SECRET` (min 16 chars)

### Rules

1. Cookie carries IDs only — not roles, permissions, or entitlement grants.
2. Every request re-validates membership / platform-admin access and branch scope server-side.
3. **Never trust** `organizationId` / `branchId` from request body, query, or custom headers alone.
4. Optional client header `x-organization-id` is allowed only as a consistency check; mismatch → `CLIENT_ORG_MISMATCH` / forbidden.
5. `platform_admin` mode requires SUPER_ADMIN and must be auditable.

---

## 3. Authorization

| Layer | Source |
|------|--------|
| Platform roles | `SUPER_ADMIN`, `SUPPORT`, `BILLING_ADMIN` (master codes) |
| Organization roles | System + custom org roles (`OWNER`, `ADMIN`, …) |
| Custom roles | Org-scoped roles with permission matrix |
| Effective permissions | Computed server-side from platform + organization roles |
| Branch scopes | `ALL_BRANCHES` / `SELECTED` / `NONE` on membership |

Rules:

- UI gates are UX only; **server/API guards are the security boundary**.
- Unknown role/permission → fail closed.
- Product apps must re-check permissions for mutations; do not cache permission grants longer than entitlement cache rules below for privileged writes.

---

## 4. Product Entitlements

Product code for HR: **`GOLDENSOFT_HR`** (alias accepted in catalog helpers: `HR`).

### Baseline entitlement codes

| Code | Kind | Purpose |
|------|------|---------|
| `hr.access` | boolean | Gate entry to HR product |
| `hr.employee_limit` | numeric | Max employees |
| `hr.branch_limit` | numeric | Max HR branches |
| `hr.mobile_clock_in` | boolean | Mobile clock-in feature |
| `hr.payroll` | boolean | Payroll feature |
| `hr.overtime` | boolean | Overtime feature |

### Check response shape

```json
{
  "allowed": true,
  "value": "50",
  "reason": null,
  "subscriptionStatus": "ACTIVE",
  "expiresAt": "2026-12-31T00:00:00.000Z",
  "organizationId": "<uuid>",
  "productCode": "GOLDENSOFT_HR",
  "entitlementCode": "hr.employee_limit",
  "branchId": null
}
```

Rules:

- Entitlement is always evaluated server-side from Platform subscription/entitlement data.
- Products may cache entitlement results **≤ 5 minutes** for ordinary reads; privileged HR writes (payroll, sensitive changes) should use live check or cache ≤ 60 seconds.
- Expired cache must not grant access.
- Hard limits: product enforces before create; usage counts come from product DB, never from client.

---

## 5. APIs and shared services (HR consumption)

Base URL: Platform app origin (`NEXT_PUBLIC_APP_URL` of Platform, or dedicated Platform API host when split).

| Need | Method | Path | Notes |
|------|--------|------|-------|
| Resolve current user | `GET` | `/api/auth/me` | Auth required; returns profile, memberships, active org/branch from **verified cookie**, permissions |
| Resolve org/branch context | Cookie `gs_platform_ctx` + `GET /api/auth/me` or `GET /api/platform/context` | Never invent context client-side |
| Switch org/branch | `POST` | `/api/platform/context` | Body `{ organizationId, branchId? }`; server validates membership/admin |
| Check entitlement | `POST` | `/api/platform/entitlements/check` | Body `{ organizationId, productCode, entitlementCode, branchId? }` |
| Effective permissions | From `/api/auth/me` → `permissions[]` | Recompute on server for mutations when needed |

### Auth for product → Platform calls

- Browser session cookies (same-site / shared parent domain) **or**
- Server-side Platform client that forwards the user session cookie / validated auth user id after local verification.

HR must not call Platform with a forged `organizationId` and expect trust.

---

## 6. Error contract

Product apps should map these codes to Thai UX. HTTP status is normative for APIs.

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `TENANT_CONTEXT_REQUIRED` | 403 | Missing/invalid organization context |
| `PRODUCT_NOT_ENTITLED` | 403 | Entitlement `allowed=false` for required code |
| `SUBSCRIPTION_INACTIVE` | 403 | Subscription not in usable status |
| `BRANCH_OUT_OF_SCOPE` | 403 | Requested branch outside membership scope |
| `CLIENT_ORG_MISMATCH` | 403 | Client org claim ≠ verified context |
| `INVALID_BODY` | 400 | Schema validation failed |
| `PROFILE_NOT_FOUND` | 403 | No active platform profile |
| `PROFILE_SUSPENDED` | 403 | Profile not ACTIVE |

---

## 7. Security

1. HR **must not** trust role/permission/entitlement flags from the client.
2. HR **must not** query or mutate another tenant’s data (`organizationId` isolation on every query).
3. Entitlement and subscription checks are server-side only.
4. Product database is a separate schema/repository; no FK into `platform` or `auth`.
5. Auth is central; HR business tables stay in HR.
6. SUPER_ADMIN enters an HR tenant only via auditable `platform_admin` context.
7. Ordinary users see only orgs/branches granted by membership + branch scope.

---

## 8. HR-specific integration checklist

- [ ] Every protected HR route requires login
- [ ] Organization context required (`TENANT_CONTEXT_REQUIRED` otherwise)
- [ ] `hr.access` entitlement required
- [ ] Branch routes enforce branch scope
- [ ] Permissions enforced server-side
- [ ] Deny → 403 API or Thai redirect page (no silent allow)
- [ ] No hard-coded “allow all organizations”
- [ ] No PostgreSQL enums for status/type — use master/lookup tables with immutable `code`

---

## 9. Versioning

- Contract id: `platform-integration-contract-v1`
- Breaking changes require a new major contract document and coordinated product release
- Additive entitlement codes may be appended without a major bump when defaults remain fail-closed

---

## 10. Customer App (Phase 8B.1)

| Concern | Contract |
|--------|----------|
| Customer host | `goldensoft-app` (`app.goldensoft.cloud`) |
| Admin host | `goldensoft-platform` (`platform.goldensoft.cloud`) — Admin shell only |
| Bootstrap | `GET /api/customer/bootstrap` — session + org/branch + product cards + effective permissions |
| Central Login return | Allowlisted absolute `next` via `CUSTOMER_APP_ORIGINS` (plus relative paths) |
| Cookie | Still **only** `gs_platform_ctx` |
| Product paths | `/hr/*`, `/resident/*`, `/qrstation/*` under Customer App (path-based / reverse-proxy) |

Customer App context details: `goldensoft-app/docs/customer-app-context-contract-v1.md`.

Platform Admin Sidebar must not be shown to ordinary customer users as their product UI.
