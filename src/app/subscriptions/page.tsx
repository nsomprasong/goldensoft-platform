import { prisma } from "@/lib/prisma";
import { parseSubscriptionSnapshot } from "@/lib/platform/snapshot";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const subscriptions = await prisma.subscription.findMany({
    include: { organization: true, product: true, plan: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="card">
      <h2 className="text-xl font-semibold">Subscriptions</h2>
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
                {sub.status} · snapshot v{snapshot.planVersion} · features{" "}
                {snapshot.featureCodes.length}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
