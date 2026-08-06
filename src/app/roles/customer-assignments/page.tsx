import { Building2 } from "lucide-react";

import { CustomerAssignmentPanel } from "@/components/customer-assignment-panel";
import { PlatformShell } from "@/components/platform-shell";
import { RoleManagementSubmenu } from "@/components/role-management-submenu";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { PLATFORM_PERMISSIONS } from "@/lib/permissions/codes";
import { resolveActorPermissionCodes } from "@/lib/platform/custom-roles";
import { GOLDENSOFT_ORG, isGoldenSoftCustomerCode } from "@/lib/platform/bootstrap-organization";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CustomerAssignmentsPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
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
  if (!organizationId || !platformContext || query.organizationId && query.organizationId !== organizationId) {
    return <PlatformShell {...shellProps}><AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} /></PlatformShell>;
  }

  const permissionCodes = await resolveActorPermissionCodes(prisma, { platformRoles: ctx.bundle.platformRoles, organizationRoles: [] });
  const canManage = permissionCodes.includes(PLATFORM_PERMISSIONS.customerAssignmentManage) || permissionCodes.includes(PLATFORM_PERMISSIONS.customerPortfolioManage);
  const canTransfer = permissionCodes.includes(PLATFORM_PERMISSIONS.customerAssignmentTransfer);
  const organizations = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      status: { code: MASTER.organizationStatus.ACTIVE },
      NOT: { customerCode: GOLDENSOFT_ORG.customerCode },
      ...(canManage || canTransfer ? {} : { id: { in: ctx.managedOrganizationIds } }),
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
    take: 200,
  });
  const organizationIds = organizations.map((organization) => organization.id);
  const [staff, assignments] = await Promise.all([
    prisma.userProfile.findMany({
      where: { deletedAt: null, memberships: { some: { organization: { customerCode: GOLDENSOFT_ORG.customerCode }, endedAt: null, status: { code: MASTER.membershipStatus.ACTIVE } } } },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    }),
    organizationIds.length > 0
      ? prisma.staffOrganizationAssignment.findMany({
          where: { organizationId: { in: organizationIds }, revokedAt: null },
          include: { staffUserProfile: { select: { displayName: true, email: true } } },
          orderBy: [{ organizationId: "asc" }, { assignedAt: "asc" }],
        })
      : [],
  ]);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader title="ผู้รับผิดชอบองค์กรลูกค้า" description="จัดการผู้รับผิดชอบและทีม Support ของแต่ละองค์กร" icon={<Building2 size={24} />} />
      <div className="mx-auto w-full max-w-5xl pb-24">
        <CustomerAssignmentPanel
          organizations={organizations.map((organization) => ({ id: organization.id, name: organization.displayName }))}
          staffOptions={staff.map((profile) => ({ id: profile.id, label: `${profile.displayName} · ${profile.email}` }))}
          assignments={assignments.map((assignment) => ({ id: assignment.id, organizationId: assignment.organizationId, staffUserProfileId: assignment.staffUserProfileId, staffLabel: `${assignment.staffUserProfile.displayName} · ${assignment.staffUserProfile.email}`, note: assignment.note }))}
          canManage={canManage}
          canTransfer={canTransfer}
        />
      </div>
      <RoleManagementSubmenu active="customer-assignments" organizationId={organizationId} platformContext />
    </PlatformShell>
  );
}
