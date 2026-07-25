import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    include: {
      status: true,
      _count: { select: { features: true, plans: true } },
    },
    orderBy: { code: "asc" },
  });

  return (
    <section className="card">
      <h2 className="text-xl font-semibold">Products</h2>
      <ul className="mt-4 space-y-3">
        {products.map((p) => (
          <li key={p.id} className="rounded-xl border border-[var(--border)] p-3">
            <div className="font-semibold">
              {p.code} — {p.name}
            </div>
            <p className="text-xs text-slate-500">
              {p._count.plans} plans · {p._count.features} features ·{" "}
              {p.status.code}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
