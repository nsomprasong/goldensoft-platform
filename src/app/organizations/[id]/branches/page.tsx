import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function BranchesPage({ params }: Props) {
  const { id } = await params;
  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      branches: {
        where: { deletedAt: null },
        include: { status: true },
        orderBy: { code: "asc" },
      },
    },
  });
  if (!org) notFound();

  return (
    <section className="card">
      <h2 className="text-xl font-semibold">Branches — {org.displayName}</h2>
      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-slate-500">
            <th className="py-2">Code</th>
            <th>Name</th>
            <th>Status</th>
            <th>Timezone</th>
          </tr>
        </thead>
        <tbody>
          {org.branches.map((b) => (
            <tr key={b.id} className="border-b border-[var(--border)]">
              <td className="py-2 font-medium">{b.code}</td>
              <td>{b.name}</td>
              <td>{b.status.code}</td>
              <td>{b.timezone}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
