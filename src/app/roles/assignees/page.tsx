import Link from "next/link";
import { UserPlus, UserRoundCheck } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import { RoleAssignmentPanel } from "@/components/role-assignment-panel";
import { RoleManagementSubmenu } from "@/components/role-management-submenu";
import { AccessDenied, PageHeader, SectionHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH, labelRole } from "@/lib/i18n/th";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { isGoldenSoftCustomerCode, GOLDENSOFT_ORG } from "@/lib/platform/bootstrap-organization";
import { MASTER } from "@/lib/platform/master-codes";
import {
  organizationRoleAssignmentWhere,
  organizationRoleMembershipWhere,
} from "@/lib/platform/role-assignee-scope";
import { prisma } from "@/lib/prisma";

import styles from "./assignees.module.css";

export const dynamic = "force-dynamic";

export default async function RoleAssigneesPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; roleId?: string }> }) {
  const ctx = await requirePlatformPage();
  const query = await searchParams;
  const organizationId = ctx.activeOrganization?.id ?? null;
  const platformContext = ctx.contextMode === "platform_admin" && isGoldenSoftCustomerCode(ctx.activeOrganization?.customerCode);
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  if (!organizationId || query.organizationId && query.organizationId !== organizationId || !ctx.permissionCodes.includes(PLATFORM_PERMISSIONS.roleRead)) {
    return <PlatformShell {...shellProps}><AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} /></PlatformShell>;
  }

  type RoleOption = {
    id: string;
    code: string;
    nameTh: string;
    assignmentCount: number;
    assigned: Array<{ id: string; assignmentId: string; label: string }>;
  };
  type Candidate = { id: string; label: string };
  let roles: RoleOption[];
  let candidates: Candidate[];
  if (platformContext) {
    const [rows, profiles] = await Promise.all([
      prisma.platformRole.findMany({
        orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
        include: {
          assignments: { where: { revokedAt: null }, select: { id: true, userProfile: { select: { id: true, displayName: true, email: true } } } },
          _count: { select: { assignments: { where: { revokedAt: null } } } },
        },
      }),
      prisma.userProfile.findMany({
        where: { deletedAt: null, memberships: { some: { organization: { customerCode: GOLDENSOFT_ORG.customerCode }, endedAt: null, status: { code: MASTER.membershipStatus.ACTIVE } } } },
        select: { id: true, displayName: true, email: true },
        orderBy: { displayName: "asc" },
      }),
    ]);
    roles = rows.map((role) => ({
      id: role.id,
      code: role.code,
      nameTh: role.nameTh,
      assignmentCount: role._count.assignments,
      assigned: role.assignments.map((assignment) => ({ id: assignment.userProfile.id, assignmentId: assignment.id, label: `${assignment.userProfile.displayName} · ${assignment.userProfile.email}` })),
    }));
    candidates = profiles.map((profile) => ({ id: profile.id, label: `${profile.displayName} · ${profile.email}` }));
  } else {
    const membershipWhere = organizationRoleMembershipWhere({
      organizationId,
      activeBranchId: ctx.activeBranch?.id,
    });
    const assignmentWhere = organizationRoleAssignmentWhere({
      organizationId,
      activeBranchId: ctx.activeBranch?.id,
    });
    const [rows, memberships] = await Promise.all([
      prisma.organizationRole.findMany({
        where: { OR: [{ organizationId: null, isSystem: true }, { organizationId }] },
        orderBy: [{ isSystem: "desc" }, { isActive: "desc" }, { sortOrder: "asc" }],
        include: {
          assignments: { where: assignmentWhere, select: { id: true, membership: { select: { id: true, userProfile: { select: { displayName: true, email: true } } } } } },
          _count: { select: { assignments: { where: assignmentWhere } } },
        },
      }),
      prisma.organizationMembership.findMany({
        where: membershipWhere,
        select: { id: true, userProfile: { select: { displayName: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    roles = rows.map((role) => ({
      id: role.id,
      code: role.code,
      nameTh: role.nameTh,
      assignmentCount: role._count.assignments,
      assigned: role.assignments.map((assignment) => ({ id: assignment.membership.id, assignmentId: assignment.id, label: `${assignment.membership.userProfile.displayName} · ${assignment.membership.userProfile.email}` })),
    }));
    candidates = memberships.map((membership) => ({ id: membership.id, label: `${membership.userProfile.displayName} · ${membership.userProfile.email}` }));
  }
  const selectedRole = roles.find((role) => role.id === query.roleId) ?? null;

  return (
    <PlatformShell {...shellProps}>
      <PageHeader title="ผู้ได้รับบทบาท" description="เลือกบทบาท แล้วเพิ่มหรือถอดผู้ใช้งาน" icon={<UserRoundCheck size={24} />} />
      <div className="grid items-start gap-4 pb-24 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <aside className="card grid gap-3 xl:sticky xl:top-[calc(var(--header-height)+1rem)]">
          <SectionHeader title={platformContext ? "บทบาทแพลตฟอร์ม" : "บทบาทภายในองค์กร"} description="เลือกบทบาทเพื่อดูผู้ได้รับบทบาท" />
          <ul className="grid gap-2">
            {roles.map((role) => (
              <li key={role.id}>
                <Link
                  href={`/roles/assignees?context=${platformContext ? "platform" : "organization"}&organizationId=${organizationId}&roleId=${role.id}#role-assignment-editor`}
                  aria-current={selectedRole?.id === role.id ? "page" : undefined}
                  className={`${styles.roleCard} ${selectedRole?.id === role.id ? styles.roleCardSelected : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{role.nameTh || labelRole(role.code)}</span>
                    <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">ผู้ได้รับบทบาท {role.assignmentCount} คน</span>
                  </span>
                  <span
                    className={`${styles.addButton} nav-icon-idle-organization inline-flex size-10 shrink-0 items-center justify-center rounded-full`}
                    aria-label={`เพิ่มพนักงานในบทบาท ${role.nameTh || labelRole(role.code)}`}
                    title="เพิ่มพนักงาน"
                  >
                    <UserPlus className="size-5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        <main id="role-assignment-editor" className="min-w-0 scroll-mt-24">
          {selectedRole ? (
            <RoleAssignmentPanel
              key={`${platformContext ? "platform" : "organization"}:${organizationId}:${selectedRole.id}`}
              scope={platformContext ? "platform" : "organization"}
              roleId={selectedRole.id}
              roleName={selectedRole.nameTh || labelRole(selectedRole.code)}
              assignees={candidates}
              assigned={selectedRole.assigned}
            />
          ) : (
            <section className="card grid min-h-40 place-content-center gap-1 text-center">
              <UserPlus className="mx-auto size-8 text-[var(--dashboard-blue)]" aria-hidden="true" />
              <h2 className="font-semibold">เลือกบทบาทเพื่อเพิ่มพนักงาน</h2>
              <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">กดไอคอนเพิ่มพนักงานด้านขวาของบทบาท</p>
            </section>
          )}
        </main>
      </div>
      <RoleManagementSubmenu active="assignees" organizationId={organizationId} platformContext={platformContext} />
    </PlatformShell>
  );
}
