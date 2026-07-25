import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { branches: true } } },
    orderBy: { displayName: "asc" },
  });

  return (
    <section className="card">
      <h2 className="text-xl font-semibold">Organizations</h2>
      <ul className="mt-4 divide-y divide-[var(--border)]">
        {organizations.map((org) => (
          <li key={org.id} className="flex items-center justify-between py-3">
            <div>
              <Link
                href={`/organizations/${org.id}`}
                className="font-medium text-[var(--accent)]"
              >
                {org.displayName}
              </Link>
              <p className="text-xs text-slate-500">
                {org.customerCode} · {org.slug} · {org._count.branches} branches
              </p>
            </div>
            <span className="text-xs font-semibold">{org.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
