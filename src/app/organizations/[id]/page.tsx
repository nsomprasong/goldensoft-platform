import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformShell } from "@/components/platform-shell";
import { PageHeader, StatusBadge } from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { canManageOrganization } from "@/lib/platform/organizations-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function OrganizationDetailPage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const actor = await loadActorAccess(prisma, ctx.user.id);
  // Explicit select: avoid Phase 5 columns until migration 0002 is applied.
  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      customerCode: true,
      slug: true,
      displayName: true,
      legalName: true,
      taxId: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      status: { select: { code: true } },
      branches: {
        where: { deletedAt: null },
        select: {
          id: true,
          code: true,
          name: true,
          status: { select: { code: true } },
        },
        orderBy: { code: "asc" },
      },
      subscriptions: {
        select: {
          id: true,
          product: { select: { code: true } },
          plan: { select: { code: true } },
          status: { select: { code: true } },
        },
      },
    },
  });

  if (!org || org.deletedAt) notFound();

  const canManage = canManageOrganization(actor, id);

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
          <PageHeader
            title={org.displayName}
            description={`${org.legalName} · ${org.customerCode}`}
            actions={
              canManage ? (
                <Link href={`/organizations/${org.id}/edit`} className="btn">
                  {TH.org.edit}
                </Link>
              ) : null
            }
          />
          <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
            <div>
              <dt className="text-slate-500">{TH.org.code}</dt>
              <dd>{org.customerCode}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{TH.common.status}</dt>
              <dd>
                <StatusBadge label={labelStatus(org.status.code)} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{TH.org.taxId}</dt>
              <dd>{org.taxId ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{TH.org.createdAt}</dt>
              <dd>{org.createdAt.toISOString().slice(0, 10)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{TH.org.updatedAt}</dt>
              <dd>{org.updatedAt.toISOString().slice(0, 10)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            ฟิลด์ติดต่อ/ชื่ออังกฤษ/สาขาหลักจะใช้ได้หลัง apply migration 0002
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
