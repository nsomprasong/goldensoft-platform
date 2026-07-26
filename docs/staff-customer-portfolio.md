# Staff Customer-Portfolio Management (Phase 1)

## Goal

Let GoldenSoft staff (sales / account managers) be assigned to specific
**customer organizations**, and then manage that customer's users, roles, and
permissions from Platform Admin — without becoming a member of the customer
organization and without any product-logic changes in `goldensoft-hr` or
`goldensoft-app`.

Commission is explicitly **out of scope** for this phase.

## Data model

New table (migration `0007_staff_customer_portfolio`, additive, **applied 2026-07-26**):

`platform.staff_organization_assignments`

| column | notes |
|---|---|
| `staff_user_profile_id` | FK → `user_profiles`. The GoldenSoft staff member. |
| `organization_id` | FK → `organizations`. The customer org they're assigned to. |
| `assigned_by_auth_user_id` | who created the assignment (usually a `SUPER_ADMIN`). |
| `assigned_at` / `revoked_at` | `revoked_at IS NULL` means the assignment is active. |
| `note` | optional free text. |

A partial unique index on `(staff_user_profile_id, organization_id) WHERE
revoked_at IS NULL` guarantees at most one **active** assignment per
staff/organization pair; history is preserved by revoking (not deleting) rows.

**Staff assigned via this table are never inserted into
`organization_memberships`.** They get access purely through the
authorization helpers below, scoped to the orgs in their active portfolio.

Also seeded (idempotent `INSERT ... ON CONFLICT DO NOTHING`, same pattern as
migrations `0004`/`0006`):

- Platform roles `SALES` and `ACCOUNT_MANAGER`.
- Permission `platform.customer_portfolio.manage` — required to assign/revoke
  portfolio rows. Only `SUPER_ADMIN` gets this by default.
- Audit action types `staff_portfolio.assign` / `staff_portfolio.revoke`.

## Authorization model

`src/lib/platform/customer-portfolio.ts` is the single source of truth:

- `listActiveManagedOrganizationIds(db, staffUserProfileId)` — active org ids
  for a staff profile.
- `canManageCustomerOrganization(actor, organizationId)` — `true` if the actor
  is `SUPER_ADMIN`, **or** holds a portfolio-capable platform role
  (`SALES`/`ACCOUNT_MANAGER`, or anything else granted `role.assign`) **and**
  the organization is in the actor's active managed portfolio.
- `canManagePortfolioAssignments(actor)` — `true` only for `SUPER_ADMIN` or an
  actor whose effective permissions include
  `platform.customer_portfolio.manage`. This gates who may create/revoke
  portfolio rows themselves (assigning a portfolio is stricter than using
  one).

`ActorAccess` (built once per request in `loadActorAccess`) now carries
`managedOrganizationIds: string[]` alongside the existing
`membershipOrganizationIds`. Every authorization check that used to test
"is this org one of my memberships" was extended to also accept "is this org
in my managed portfolio":

- `assertCanAssign` (`membership-roles.ts`) — role assignment/revocation.
- `canManageCustomRoles` (`custom-roles.ts`) — custom role CRUD.
- `canInviteOrganizationUser` (`user-invitations.ts`) — inviting users.
- `canAccessOrganization` (`access.ts`) — general per-request org access.
- `/users`, `/users/invite`, `/users/[id]`, `/users/profiles/[id]`, `/roles`,
  and their API routes — all filter to
  `membership orgs ∪ managed orgs ∪ everything if SUPER_ADMIN`.

Staff can invite/assign `ADMIN` or `BILLING_CONTACT` in a managed org, but can
never grant `OWNER` (see `canAssignOrganizationRole` in `admin-guards.ts`).

## Context modes

The `gs_platform_ctx` cookie's `mode` field gained a third value:

```
mode: "membership" | "platform_admin" | "managed_org"
```

- `membership` — normal org membership (unchanged).
- `platform_admin` — `SUPER_ADMIN` managing any org without membership
  (unchanged).
- `managed_org` — staff managing a customer org that is in their active
  portfolio, again without membership.

`/api/platform/context` (`GET`/`POST`) resolves and returns
`managedOrganizations` alongside `platformAdminOrganizations`, and accepts
`mode: "managed_org"` on switch, validated against
`listActiveManagedOrganizationIds`. The context switcher shows an
`optgroup` labelled **"ลูกค้าในพอร์ตโฟลิโอ"** for these orgs, and a badge
("โหมดจัดการพอร์ตโฟลิโอลูกค้า") indicates when a staff member is currently
acting in `managed_org` mode.

## APIs

`GET/POST/DELETE /api/platform/staff-organization-assignments`

- `GET` — list assignments (optionally filtered by `staffUserProfileId` /
  `organizationId`). Requires `canManagePortfolioAssignments`.
- `POST` — assign `{ staffUserProfileId, organizationId, note? }`. Requires
  `canManagePortfolioAssignments`; rejects if the pair already has an active
  assignment (`CONFLICT`), or if either id doesn't resolve (`NOT_FOUND`).
- `DELETE` — revoke `{ assignmentId }` (sets `revoked_at`, keeps history).

All mutations write an audit log entry (`staff_portfolio.assign` /
`staff_portfolio.revoke`).

## UI

- `/staff-portfolio` (nav item "พอร์ตโฟลิโอลูกค้า", visible to `SUPER_ADMIN`
  only) — assign a staff profile (any `SALES`/`ACCOUNT_MANAGER`) to a customer
  organization, with an optional note; lists active assignments with a revoke
  action, plus a short revocation history. Backed entirely by the API above —
  no placeholder/fake buttons.
- Context switcher — managed orgs appear in their own optgroup once the
  browser lazily fetches `/api/platform/context` (mirrors how
  `platformAdminOrganizations` is loaded for `SUPER_ADMIN`).

## How HR / App pick up the change

No product-logic changes were made (or needed) in `goldensoft-hr` or
`goldensoft-app`. Both continue to call `GET /api/customer/bootstrap`, which
derives permissions purely from the requester's session + org context as
already resolved by Platform. Once a staff member is managing a customer
organization from Platform Admin and grants/edits roles for that
organization's real users, those changes are ordinary `organization_roles` /
`organization_role_permissions` rows — exactly what bootstrap already reads
for any other org admin. There is nothing "staff-specific" for HR/App to
special-case: the staff member's own session never targets HR/App (their
`managed_org` context mode is only meaningful inside Platform Admin), and the
customer users they manage look, to HR/App, like they were edited by any
other org admin.

`goldensoft-app`'s own `PlatformContextCookie` type is unchanged; it does not
need to recognize `managed_org` because staff never present that cookie value
to the customer app — decoding falls back to `undefined` for unrecognized
values, which existing access checks already handle safely.

## What still needs explicit approval

- The migration at `prisma/migrations/0007_staff_customer_portfolio/migration.sql`
  is **not applied**. To apply: review it, then run the project's normal
  Prisma migration flow for this environment (do not use `db push` or
  `migrate reset`). `AUTH_INVITE_MODE` is untouched.
