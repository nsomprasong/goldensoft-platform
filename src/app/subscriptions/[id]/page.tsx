import Link from "next/link";
import { notFound } from "next/navigation";

import { SubscriptionActions } from "@/components/subscription-form";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import {
  getSubscription,
  listSubscriptionHistoryFromAudit,
} from "@/lib/platform/subscriptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
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
  };
  if (!perms.includes(PLATFORM_PERMISSIONS.subscriptionRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }
  const { id } = await params;
  let subscription;
  try {
    subscription = await getSubscription(prisma, id);
  } catch {
    notFound();
  }
  const isSuper = actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  if (
    !isSuper &&
    !actor.membershipOrganizationIds.includes(subscription.organizationId)
  ) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const [history, siblingPlans] = await Promise.all([
    listSubscriptionHistoryFromAudit(prisma, id),
    prisma.plan.findMany({
      where: {
        productId: subscription.productId,
        status: { code: MASTER.planStatus.ACTIVE },
      },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const canManage = perms.includes(PLATFORM_PERMISSIONS.subscriptionManage);
  const snapshot = subscription.snapshotJson as Record<string, unknown>;

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={`${subscription.organization.displayName} · ${subscription.product.code}`}
        description={subscription.plan.code}
        status={
          <StatusBadge
            label={labelStatus(subscription.status.code)}
            code={subscription.status.code}
          />
        }
        actions={
          <Link href="/subscriptions" className="btn-secondary">
            {TH.common.back}
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-4">
          <DetailList
            items={[
              {
                label: "องค์กร",
                value: subscription.organization.displayName,
              },
              { label: "ผลิตภัณฑ์", value: subscription.product.code },
              { label: "แพ็กเกจ", value: subscription.plan.code },
              {
                label: "เวอร์ชัน",
                value: String(subscription.planVersionNumber),
              },
              {
                label: "ราคา",
                value: `${Number(subscription.priceAmount).toLocaleString("th-TH")} ${subscription.currency}`,
              },
              { label: "รอบบิล", value: subscription.billingCycle.nameTh },
              {
                label: "เริ่ม",
                value: subscription.startsAt.toLocaleString("th-TH"),
              },
              {
                label: "สิ้นสุด",
                value: subscription.endsAt
                  ? subscription.endsAt.toLocaleString("th-TH")
                  : "—",
              },
            ]}
          />
          <SubscriptionActions
            subscriptionId={subscription.id}
            statusCode={subscription.status.code}
            plans={siblingPlans}
            canManage={canManage}
            canRegenerate={isSuper}
          />
        </section>
        <section className="card space-y-3">
          <h3 className="text-sm font-semibold">Snapshot</h3>
          <pre className="overflow-auto rounded bg-[var(--surface-muted)] p-3 text-xs">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
          <h3 className="text-sm font-semibold">Entitlements</h3>
          <ul className="space-y-2 text-sm">
            {subscription.entitlements.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>
                  {e.nameTh} ({e.code})
                  {e.limitValue ? ` = ${e.limitValue}` : ""}
                </span>
                <StatusBadge
                  label={labelStatus(e.status.code)}
                  code={e.status.code}
                />
              </li>
            ))}
          </ul>
          <h3 className="text-sm font-semibold">ประวัติ</h3>
          <ul className="space-y-2 text-sm">
            {history.length === 0 ? (
              <li className="text-[var(--text-secondary)]">ยังไม่มีประวัติ</li>
            ) : (
              history.map((h) => (
                <li key={h.id}>
                  {h.actionType.nameTh} ·{" "}
                  {h.createdAt.toLocaleString("th-TH")}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </PlatformShell>
  );
}
