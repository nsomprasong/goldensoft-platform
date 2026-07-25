import { PlatformShell } from "@/components/platform-shell";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const ctx = await requirePlatformPage();
  const plans = await prisma.plan.findMany({
    include: {
      product: true,
      versions: {
        include: { status: true },
        orderBy: { versionNumber: "desc" },
        take: 3,
      },
    },
    orderBy: [{ product: { code: "asc" } }, { code: "asc" }],
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
        <h2 className="text-xl font-semibold">{TH.pages.plansTitle}</h2>
        <ul className="mt-4 space-y-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="rounded-xl border border-[var(--border)] p-3"
            >
              <div className="font-semibold">
                {plan.product.code} / {plan.name} ({plan.code})
              </div>
              <p className="text-xs text-slate-500">
                เวอร์ชัน:{" "}
                {plan.versions
                  .map(
                    (v) =>
                      `v${v.versionNumber}: ${labelStatus(v.status.code)}`,
                  )
                  .join(", ") || TH.common.notFound}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </PlatformShell>
  );
}
