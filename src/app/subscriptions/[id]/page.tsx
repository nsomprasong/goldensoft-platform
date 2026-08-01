import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { SubscriptionActions } from "@/components/subscription-form";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
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
    organizations: membershipOrganizationOptions(ctx.bundle),
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
          <IconTextLink
            href="/subscriptions"
            variant="outline"
            label={TH.common.back}
            icon={<ArrowLeft className="size-5" />}
          />
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
          <h3 className="text-sm font-semibold">ประวัติการเปลี่ยนแปลง</h3>
          {history.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              ยังไม่มีประวัติการเปลี่ยนแปลง
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {history.map((h) => {
                const domain = "domainHistory" in h && h.domainHistory;
                const fromStatus = domain
                  ? (h as { fromStatusCode?: string | null }).fromStatusCode
                  : null;
                const toStatus = domain
                  ? (h as { toStatusCode?: string | null }).toStatusCode
                  : null;
                const fromPlan = domain
                  ? (h as { fromPlanCode?: string | null }).fromPlanCode
                  : null;
                const toPlan = domain
                  ? (h as { toPlanCode?: string | null }).toPlanCode
                  : null;
                const reason = domain
                  ? (h as { reason?: string | null }).reason
                  : null;
                const snap =
                  domain &&
                  (h as { snapshotJson?: unknown }).snapshotJson &&
                  typeof (h as { snapshotJson?: unknown }).snapshotJson ===
                    "object"
                    ? ((h as { snapshotJson: Record<string, unknown> })
                        .snapshotJson as Record<string, unknown>)
                    : null;
                return (
                  <li
                    key={h.id}
                    className="rounded border border-[var(--border)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{h.actionType.nameTh}</strong>
                      <span className="text-[var(--text-secondary)]">
                        {h.createdAt.toLocaleString("th-TH")}
                      </span>
                    </div>
                    {(fromStatus || toStatus) && (
                      <p>
                        สถานะ: {fromStatus ?? "—"} → {toStatus ?? "—"}
                      </p>
                    )}
                    {(fromPlan || toPlan) && (
                      <p>
                        แพ็กเกจ: {fromPlan ?? "—"} → {toPlan ?? "—"}
                      </p>
                    )}
                    {reason ? <p>หมายเหตุ: {reason}</p> : null}
                    {snap &&
                    (typeof snap.basePrice === "number" ||
                      typeof snap.currency === "string") ? (
                      <p>
                        Snapshot:{" "}
                        {typeof snap.basePrice === "number"
                          ? Number(snap.basePrice).toLocaleString("th-TH")
                          : ""}{" "}
                        {typeof snap.currency === "string" ? snap.currency : ""}
                      </p>
                    ) : null}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[var(--text-secondary)]">
                        รายละเอียดเพิ่มเติม
                      </summary>
                      <pre className="mt-1 overflow-auto rounded bg-[var(--surface-muted)] p-2 text-xs">
                        {JSON.stringify(
                          {
                            before: h.beforeJson,
                            after: h.afterJson,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </PlatformShell>
  );
}
