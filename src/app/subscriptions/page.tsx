import { PlatformShell } from "@/components/platform-shell";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { parseSubscriptionSnapshot } from "@/lib/platform/snapshot";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const ctx = await requirePlatformPage();
  const subscriptions = await prisma.subscription.findMany({
    select: {
      id: true,
      createdAt: true,
      snapshotJson: true,
      organization: { select: { displayName: true, customerCode: true } },
      product: { select: { code: true, name: true } },
      plan: { select: { code: true, name: true } },
      status: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
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
        <h2 className="text-xl font-semibold">{TH.pages.subscriptionsTitle}</h2>
        <ul className="mt-4 space-y-3">
          {subscriptions.map((sub) => {
            const snapshot = parseSubscriptionSnapshot(sub.snapshotJson);
            return (
              <li
                key={sub.id}
                className="rounded-xl border border-[var(--border)] p-3 text-sm"
              >
                <div className="font-semibold">
                  {sub.organization.displayName} · {sub.product.code} /{" "}
                  {sub.plan.code}
                </div>
                <p className="text-xs text-slate-500">
                  {labelStatus(sub.status.code)} · snapshot v
                  {snapshot.planVersion} · คุณสมบัติ{" "}
                  {snapshot.featureCodes.length}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </PlatformShell>
  );
}
