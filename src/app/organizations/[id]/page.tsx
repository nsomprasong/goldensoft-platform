import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformShell } from "@/components/platform-shell";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function OrganizationDetailPage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      status: true,
      branches: {
        where: { deletedAt: null },
        include: { status: true },
        orderBy: { code: "asc" },
      },
      subscriptions: {
        include: { product: true, plan: true, status: true },
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
      <div className="grid gap-4">
        <section className="card">
          <h2 className="text-xl font-semibold">{org.displayName}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {org.legalName} · {org.customerCode} · {org.slug} ·{" "}
            {labelStatus(org.status.code)}
          </p>
          <Link href={`/organizations/${org.id}/branches`} className="btn mt-4">
            จัดการ{TH.nav.branches}
          </Link>
        </section>
        <section className="card">
          <h3 className="font-semibold">{TH.nav.branches}</h3>
          <ul className="mt-2 text-sm">
            {org.branches.map((b) => (
              <li key={b.id}>
                {b.code} — {b.name} ({labelStatus(b.status.code)})
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3 className="font-semibold">{TH.nav.subscriptions}</h3>
          <ul className="mt-2 text-sm">
            {org.subscriptions.map((s) => (
              <li key={s.id}>
                {s.product.code} / {s.plan.code} · {labelStatus(s.status.code)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PlatformShell>
  );
}
