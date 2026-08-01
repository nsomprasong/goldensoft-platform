import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import { PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { serializeMoney } from "@/lib/billing/money";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function BillingIndexPage() {
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const permissions = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  const canRead = permissions.includes(PLATFORM_PERMISSIONS.billingAccountRead);
  if (!canRead && !ctx.bundle.platformRoles.includes("SUPER_ADMIN")) {
    return (
      <PlatformShell
        displayName={ctx.bundle.profile?.displayName ?? "ผู้ใช้"}
        platformRoles={ctx.bundle.platformRoles}
        organizationRoles={ctx.organizationRoles}
        organizations={membershipOrganizationOptions(ctx.bundle)}
        branches={ctx.branches}
        activeOrganization={ctx.activeOrganization}
        activeBranch={ctx.activeBranch}
      >
        <PageHeader title="การเงิน" description="คุณไม่มีสิทธิ์ดูบัญชีการเงิน" />
      </PlatformShell>
    );
  }

  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    orderBy: { displayName: "asc" },
    take: 100,
    select: { id: true, displayName: true, customerCode: true },
  });
  const accounts = await prisma.billingAccount.findMany({
    include: { status: true },
  });
  const byOrg = new Map(accounts.map((a) => [a.organizationId, a]));

  const shell = {
    displayName: ctx.bundle.profile?.displayName ?? "ผู้ใช้",
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  return (
    <PlatformShell {...shell}>
      <PageHeader
        title="บัญชีการเงิน"
        description="รายการองค์กรและสถานะบัญชี — ยังไม่มี Payment Gateway ในเฟสนี้"
      />
      <section className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">องค์กร</th>
                <th className="p-2">รหัส</th>
                <th className="p-2">บัญชี</th>
                <th className="p-2">เครดิต</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const account = byOrg.get(org.id);
                return (
                  <tr key={org.id} className="border-t">
                    <td className="p-2">{org.displayName}</td>
                    <td className="p-2">{org.customerCode}</td>
                    <td className="p-2">
                      {account ? account.status.code : "ยังไม่มีบัญชี"}
                    </td>
                    <td className="p-2">
                      {account
                        ? serializeMoney(account.currentBalanceSnapshot)
                        : "—"}
                    </td>
                    <td className="p-2">
                      <Link href={`/billing/${org.id}`}>รายละเอียด</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PlatformShell>
  );
}
