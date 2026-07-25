import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const plans = await prisma.plan.findMany({
    include: {
      product: true,
      versions: { orderBy: { versionNumber: "desc" }, take: 3 },
    },
    orderBy: [{ product: { code: "asc" } }, { code: "asc" }],
  });

  return (
    <section className="card">
      <h2 className="text-xl font-semibold">Plans</h2>
      <ul className="mt-4 space-y-3">
        {plans.map((plan) => (
          <li key={plan.id} className="rounded-xl border border-[var(--border)] p-3">
            <div className="font-semibold">
              {plan.product.code} / {plan.code} — {plan.name}
            </div>
            <p className="text-xs text-slate-500">
              versions:{" "}
              {plan.versions
                .map((v) => `v${v.versionNumber}:${v.status}`)
                .join(", ") || "none"}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
