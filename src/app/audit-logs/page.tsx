import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchFilterBar,
} from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    action?: string;
    organizationId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const ctx = await requirePlatformPage();
  const params = await searchParams;
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: ctx.bundle.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.auditRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const take = 20;
  const where: {
    organizationId?: string | { in: string[] };
    actionType?: { code: string };
    createdAt?: { gte?: Date; lte?: Date };
  } = {};

  if (
    !actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) &&
    !actor.platformRoles.includes(MASTER.platformRole.SUPPORT)
  ) {
    where.organizationId = { in: actor.membershipOrganizationIds };
  } else if (params.organizationId) {
    where.organizationId = params.organizationId;
  }
  if (params.action) where.actionType = { code: params.action };
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) where.createdAt.lte = new Date(params.to);
  }

  const [total, rows, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        actionType: true,
        organization: { select: { displayName: true, customerCode: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
    }),
    prisma.auditActionType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const qs = new URLSearchParams();
  if (params.action) qs.set("action", params.action);
  if (params.organizationId) qs.set("organizationId", params.organizationId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);

  return (
    <PlatformShell {...shellProps}>
      <section className="card">
        <PageHeader title={TH.pages.auditTitle} />
        <SearchFilterBar>
          <form method="get" className="flex flex-wrap gap-2">
            <select
              name="action"
              defaultValue={params.action ?? ""}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <option value="">ทุกประเภท</option>
              {actions.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.nameTh}
                </option>
              ))}
            </select>
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? ""}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button className="btn" type="submit">
              {TH.common.filter}
            </button>
          </form>
        </SearchFilterBar>

        {rows.length === 0 ? (
          <EmptyState title={TH.common.empty} />
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                  <p className="font-medium">{row.actionType.nameTh}</p>
                  <p className="text-xs text-slate-500">
                    {row.organization?.displayName ?? "-"} ·{" "}
                    {row.createdAt.toISOString().slice(0, 19)}
                  </p>
                  <p className="text-xs">
                    {row.entityType}/{row.entityId.slice(0, 8)}…
                  </p>
                </li>
              ))}
            </ul>
            <DataTable
              headers={[
                TH.audit.action,
                TH.audit.organization,
                TH.audit.entity,
                "เวลา",
              ]}
            >
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border)]">
                  <td className="px-2 py-2">{row.actionType.nameTh}</td>
                  <td className="px-2 py-2">
                    {row.organization?.displayName ?? "-"}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.entityType} · {row.entityId.slice(0, 8)}…
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.createdAt.toISOString().slice(0, 19)}
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pagination
              page={page}
              pageSize={take}
              total={total}
              previousHref={
                page > 1
                  ? `?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page - 1) }).toString()}`
                  : null
              }
              nextHref={
                page * take < total
                  ? `?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page + 1) }).toString()}`
                  : null
              }
              labels={{
                previous: TH.common.previous,
                next: TH.common.next,
                page: TH.common.page,
                of: TH.common.of,
              }}
            />
          </>
        )}
      </section>
    </PlatformShell>
  );
}
