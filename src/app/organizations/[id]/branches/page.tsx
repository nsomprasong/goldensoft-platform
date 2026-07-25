import { notFound } from "next/navigation";

import { PlatformShell } from "@/components/platform-shell";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function BranchesPage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      branches: {
        where: { deletedAt: null },
        include: { status: true },
        orderBy: { code: "asc" },
      },
    },
  });
  if (!org) notFound();

  return (
    <PlatformShell
      displayName={ctx.bundle.profile?.displayName ?? TH.common.user}
      platformRoles={ctx.bundle.platformRoles}
      organizationRoles={ctx.organizationRoles}
      organizations={ctx.bundle.memberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
      }))}
      branches={ctx.branches}
      activeOrganization={ctx.activeOrganization}
      activeBranch={ctx.activeBranch}
    >
      <section className="card">
        <h2 className="text-xl font-semibold">
          {TH.pages.branchesTitle} — {org.displayName}
        </h2>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-slate-500">
              <th className="py-2">รหัส</th>
              <th>ชื่อสาขา</th>
              <th>สถานะ</th>
              <th>เขตเวลา</th>
            </tr>
          </thead>
          <tbody>
            {org.branches.map((b) => (
              <tr key={b.id} className="border-b border-[var(--border)]">
                <td className="py-2 font-medium">{b.code}</td>
                <td>{b.name}</td>
                <td>{labelStatus(b.status.code)}</td>
                <td>{b.timezone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </PlatformShell>
  );
}
