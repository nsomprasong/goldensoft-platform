import { PlatformShell } from "@/components/platform-shell";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const ctx = await requirePlatformPage();
  const products = await prisma.product.findMany({
    include: {
      status: true,
      _count: { select: { features: true, plans: true } },
    },
    orderBy: { code: "asc" },
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
        <h2 className="text-xl font-semibold">{TH.pages.productsTitle}</h2>
        <ul className="mt-4 space-y-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-[var(--border)] p-3"
            >
              <div className="font-semibold">
                {p.name} ({p.code})
              </div>
              <p className="text-xs text-slate-500">
                {p._count.plans} {TH.nav.plans} · {p._count.features} คุณสมบัติ ·{" "}
                {labelStatus(p.status.code)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </PlatformShell>
  );
}
