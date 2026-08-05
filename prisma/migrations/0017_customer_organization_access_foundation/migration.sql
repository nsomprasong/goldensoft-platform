-- DRAFT ONLY: do not apply without a separate migration approval.
-- Depends on 0016_permission_scope_metadata (permission scope metadata) and
-- extends the assignment table introduced by 0007_staff_customer_portfolio.
-- Adds auditable customer-organization assignment policy without changing
-- OrganizationMembership semantics.

CREATE TABLE platform.customer_assignment_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_th text NOT NULL,
  name_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.customer_assignment_scope_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_th text NOT NULL,
  name_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform.customer_assignment_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_th text NOT NULL,
  name_en text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform.staff_organization_assignments
  ADD COLUMN assignment_role_id uuid NULL
    REFERENCES platform.customer_assignment_roles(id) ON DELETE RESTRICT,
  ADD COLUMN scope_type_id uuid NULL
    REFERENCES platform.customer_assignment_scope_types(id) ON DELETE RESTRICT,
  ADD COLUMN status_id uuid NULL
    REFERENCES platform.customer_assignment_statuses(id) ON DELETE RESTRICT,
  ADD COLUMN starts_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN ends_at timestamptz NULL;

CREATE TABLE platform.staff_organization_assignment_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL
    REFERENCES platform.staff_organization_assignments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES platform.branches(id) ON DELETE CASCADE,
  assigned_by_auth_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, branch_id)
);

CREATE INDEX staff_org_assignment_policy_idx
  ON platform.staff_organization_assignments
    (staff_user_profile_id, organization_id, status_id, starts_at, ends_at);

CREATE INDEX staff_org_assignment_branches_branch_idx
  ON platform.staff_organization_assignment_branches(branch_id, assignment_id);

CREATE UNIQUE INDEX staff_org_assignment_one_active_staff_org_idx
  ON platform.staff_organization_assignments(staff_user_profile_id, organization_id)
  WHERE revoked_at IS NULL AND ends_at IS NULL;

-- Master rows and backfill are intentionally excluded from this migration draft.
-- They require a separately reviewed, idempotent data migration/seed.
