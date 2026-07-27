import Link from "next/link";
import { GitBranch, Pencil } from "lucide-react";
import { notFound } from "next/navigation";

import { OrganizationAdminsPanel } from "@/components/organization-admins-panel";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  detectEntitlementConsistency,
  listEntitlementsForOrganization,
} from "@/lib/platform/entitlements";
import { listOrganizationAdminContacts } from "@/lib/platform/organization-admins";
import {
  canManageOrganization,
  canViewOrganization,
} from "@/lib/platform/organizations-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function OrganizationDetailPage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const [actor, org, entitlements, admins] = await Promise.all([
    loadActorAccess(prisma, ctx.user.id),
    prisma.organization.findUnique({
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
          take: 200,
        },
        subscriptions: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            snapshotJson: true,
            product: { select: { code: true, name: true, nameTh: true } },
            plan: { select: { code: true, name: true } },
            status: { select: { code: true, nameTh: true } },
            entitlements: { select: { code: true } },
          },
          take: 50,
        },
      },
    }),
    listEntitlementsForOrganization(prisma, id),
    listOrganizationAdminContacts(prisma, id),
  ]);

  if (!org || org.deletedAt) notFound();

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
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  if (!canViewOrganization(actor, id)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const canManage = canManageOrganization(actor, id);
  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);

  return (
    <PlatformShell {...shellProps}>
      <div className="grid gap-4">
        <section className="card">
          <PageHeader
            title={org.displayName}
            description={`${org.legalName} · ${org.customerCode}`}
            meta={
              <StatusBadge
                label={labelStatus(org.status.code)}
                code={org.status.code}
              />
            }
            actions={
              <div className="flex flex-wrap items-start gap-3">
                {canManage ? (
                  <IconTextLink
                    href={`/organizations/${org.id}/edit`}
                    label={TH.org.edit}
                    icon={<Pencil className="size-5" />}
                  />
                ) : null}
                <IconTextLink
                  href={`/organizations/${org.id}/branches`}
                  variant="outline"
                  label={`จัดการ${TH.nav.branches}`}
                  icon={<GitBranch className="size-5" />}
                />
              </div>
            }
          />
          <DetailList
            items={[
              { label: TH.org.code, value: org.customerCode },
              { label: TH.common.status, value: labelStatus(org.status.code) },
              { label: TH.org.taxId, value: org.taxId ?? "-" },
              {
                label: TH.org.createdAt,
                value: org.createdAt.toLocaleDateString("th-TH"),
              },
              {
                label: TH.org.updatedAt,
                value: org.updatedAt.toLocaleDateString("th-TH"),
              },
            ]}
          />
        </section>

        <OrganizationAdminsPanel
          organizationId={org.id}
          canManage={canManage}
          admins={admins}
        />

        <section className="card">
          <SectionHeader title={TH.nav.branches} />
          {org.branches.length === 0 ? (
            <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
              {TH.common.empty}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {org.branches.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-[length:var(--text-label)]"
                >
                  <span>
                    <span className="font-medium">{b.name}</span>
                    <span className="ml-2 text-[var(--text-muted)]">{b.code}</span>
                  </span>
                  <StatusBadge
                    label={labelStatus(b.status.code)}
                    code={b.status.code}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-3">
          <SectionHeader title="ผลิตภัณฑ์และสิทธิ์การใช้งาน" />
          {org.subscriptions.length === 0 ? (
            <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
              {TH.common.empty}
            </p>
          ) : (
            <ul className="space-y-3">
              {org.subscriptions.map((s) => {
                const consistency = detectEntitlementConsistency({
                  snapshotJson: s.snapshotJson,
                  entitlementCodes: s.entitlements.map((e) => e.code),
                });
                return (
                  <li
                    key={s.id}
                    className="rounded border border-[var(--border)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <Link
                          href={`/subscriptions/${s.id}`}
                          className="font-medium text-[var(--accent)] hover:underline"
                        >
                          {s.product.nameTh ?? s.product.name} · {s.plan.name}
                        </Link>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {s.startsAt.toLocaleDateString("th-TH")}
                          {s.endsAt
                            ? ` — ${s.endsAt.toLocaleDateString("th-TH")}`
                            : ""}
                        </p>
                      </div>
                      <StatusBadge
                        label={labelStatus(s.status.code)}
                        code={s.status.code}
                      />
                    </div>
                    {consistency.stale ? (
                      <p className="mt-2 text-sm text-[var(--warning)]">
                        คำเตือน: entitlement ไม่สอดคล้องกับ snapshot
                        {consistency.missing.length
                          ? ` (ขาด: ${consistency.missing.join(", ")})`
                          : ""}
                      </p>
                    ) : null}
                    {isSuper ? (
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        SUPER_ADMIN สามารถ regenerate ได้ที่หน้ารายละเอียดการสมัคร
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <div>
            <h4 className="mb-2 text-sm font-semibold">Entitlements</h4>
            <ul className="space-y-1 text-sm">
              {entitlements.length === 0 ? (
                <li className="text-[var(--text-muted)]">—</li>
              ) : (
                entitlements.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>
                      {e.product.code} · {e.nameTh}
                      {e.limitValue ? ` = ${e.limitValue}` : ""} ·{" "}
                      {e.subscription.planCode}
                    </span>
                    <StatusBadge
                      label={labelStatus(e.status.code)}
                      code={e.status.code}
                    />
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      </div>
    </PlatformShell>
  );
}
