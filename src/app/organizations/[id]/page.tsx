import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function OrganizationDetailPage({ params }: Props) {
  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      branches: { where: { deletedAt: null }, orderBy: { code: "asc" } },
      subscriptions: { include: { product: true, plan: true } },
    },
  });

  if (!org) notFound();

  return (
    <div className="grid gap-4">
      <section className="card">
        <h2 className="text-xl font-semibold">{org.displayName}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {org.legalName} · {org.customerCode} · {org.slug}
        </p>
        <Link href={`/organizations/${org.id}/branches`} className="btn mt-4">
          Manage branches
        </Link>
      </section>
      <section className="card">
        <h3 className="font-semibold">Branches</h3>
        <ul className="mt-2 text-sm">
          {org.branches.map((b) => (
            <li key={b.id}>
              {b.code} — {b.name}
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h3 className="font-semibold">Subscriptions</h3>
        <ul className="mt-2 text-sm">
          {org.subscriptions.map((s) => (
            <li key={s.id}>
              {s.product.code} / {s.plan.code} · {s.status}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
