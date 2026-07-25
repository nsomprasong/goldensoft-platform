import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus } from "@/lib/i18n/th";
import { TH } from "@/lib/i18n/th";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const ctx = await requirePlatformPage();
  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    include: {
      status: true,
      _count: { select: { branches: true } },
    },
    orderBy: { displayName: "asc" },
  });

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
        <h2 className="text-xl font-semibold">{TH.pages.organizationsTitle}</h2>
        {organizations.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">{TH.common.notFound}</p>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {organizations.map((org) => (
              <li
                key={org.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <Link
                    href={`/organizations/${org.id}`}
                    className="font-medium text-[var(--accent)]"
                  >
                    {org.displayName}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {org.customerCode} · {org.slug} · {org._count.branches}{" "}
                    {TH.nav.branches}
                  </p>
                </div>
                <span className="text-xs font-semibold">
                  {labelStatus(org.status.code)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PlatformShell>
  );
}
