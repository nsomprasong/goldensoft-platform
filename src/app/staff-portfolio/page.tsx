import { Users2 } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import {
  StaffPortfolioAssignForm,
  StaffPortfolioRevokeButton,
} from "@/components/staff-portfolio-form";
import {
  AccessDenied,
  DataTable,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  SectionHeader,
} from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { listStaffOrganizationAssignments } from "@/lib/platform/customer-portfolio";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StaffPortfolioPage() {
  const ctx = await requirePlatformPage();
  const isSuper = ctx.bundle.platformRoles.includes(
    MASTER.platformRole.SUPER_ADMIN,
  );
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: ctx.bundle.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    pageTitle: TH.staffPortfolio.title,
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  if (!isSuper) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const assignmentActive = await prisma.assignmentStatus.findUnique({
    where: { code: MASTER.assignmentStatus.ACTIVE },
  });

  const [staffAssignments, staffProfiles, organizations] = await Promise.all([
    listStaffOrganizationAssignments(prisma, {}),
    prisma.userProfile.findMany({
      where: {
        deletedAt: null,
        platformRoles: {
          some: {
            revokedAt: null,
            statusId: assignmentActive?.id,
            role: {
              code: {
                in: [
                  MASTER.platformRole.SALES,
                  MASTER.platformRole.ACCOUNT_MANAGER,
                ],
              },
            },
          },
        },
      },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
      take: 200,
    }),
    prisma.organization.findMany({
      where: { deletedAt: null, status: { code: MASTER.organizationStatus.ACTIVE } },
      select: { id: true, displayName: true, customerCode: true },
      orderBy: { displayName: "asc" },
      take: 500,
    }),
  ]);

  const staffOptions = staffProfiles.map((s) => ({
    id: s.id,
    label: `${s.displayName} (${s.email})`,
  }));
  const organizationOptions = organizations.map((o) => ({
    id: o.id,
    label: o.customerCode ? `${o.displayName} (${o.customerCode})` : o.displayName,
  }));

  const activeAssignments = staffAssignments.filter((a) => !a.revokedAt);
  const revokedAssignments = staffAssignments.filter((a) => a.revokedAt);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.staffPortfolio.title}
        description={TH.pages.staffPortfolioBody}
        icon={<Users2 size={24} />}
      />

      <div className="grid gap-4">
        <section className="card">
          <SectionHeader title={TH.staffPortfolio.assign} />
          {staffOptions.length === 0 ? (
            <EmptyState
              title={TH.staffPortfolio.selectStaffPlaceholder}
              body="ยังไม่มีพนักงานที่ได้รับบทบาท SALES หรือ ACCOUNT_MANAGER — ไปที่เมนู «พนักงาน GoldenSoft» เพื่อกำหนดบทบาทก่อน"
            />
          ) : (
            <StaffPortfolioAssignForm
              staffOptions={staffOptions}
              organizationOptions={organizationOptions}
            />
          )}
        </section>

        <section className="card">
          <SectionHeader title={TH.staffPortfolio.activeAssignments} />
          {activeAssignments.length === 0 ? (
            <EmptyState
              title={TH.staffPortfolio.noAssignments}
              body={TH.staffPortfolio.noAssignments}
            />
          ) : (
            <>
              <ul className="mb-4 space-y-3 md:hidden">
                {activeAssignments.map((a) => (
                  <li key={a.id}>
                    <MobileRecordCard
                      title={a.staffUserProfile.displayName}
                      subtitle={a.staffUserProfile.email}
                      meta={
                        <>
                          {a.organization.displayName}
                          <br />
                          {TH.staffPortfolio.assignedAt}:{" "}
                          {a.assignedAt.toLocaleString("th-TH")}
                          {a.note ? <><br />{a.note}</> : null}
                        </>
                      }
                      status={<StaffPortfolioRevokeButton assignmentId={a.id} />}
                    />
                  </li>
                ))}
              </ul>
              <DataTable
                headers={[
                  TH.staffPortfolio.staffLabel,
                  TH.staffPortfolio.organizationLabel,
                  TH.staffPortfolio.assignedAt,
                  TH.staffPortfolio.noteLabel,
                  TH.common.actions,
                ]}
              >
                {activeAssignments.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {a.staffUserProfile.displayName}
                      <br />
                      <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                        {a.staffUserProfile.email}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{a.organization.displayName}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {a.assignedAt.toLocaleString("th-TH")}
                    </td>
                    <td className="px-3 py-2.5">{a.note || "-"}</td>
                    <td className="px-3 py-2.5">
                      <StaffPortfolioRevokeButton assignmentId={a.id} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            </>
          )}
        </section>

        {revokedAssignments.length > 0 ? (
          <section className="card">
            <SectionHeader title="ประวัติการถอดการมอบหมาย" />
            <DataTable
              headers={[
                TH.staffPortfolio.staffLabel,
                TH.staffPortfolio.organizationLabel,
                TH.staffPortfolio.assignedAt,
                "วันที่ถอด",
              ]}
            >
              {revokedAssignments.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-3 py-2.5">{a.staffUserProfile.displayName}</td>
                  <td className="px-3 py-2.5">{a.organization.displayName}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {a.assignedAt.toLocaleString("th-TH")}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {a.revokedAt?.toLocaleString("th-TH")}
                  </td>
                </tr>
              ))}
            </DataTable>
          </section>
        ) : null}
      </div>
    </PlatformShell>
  );
}
