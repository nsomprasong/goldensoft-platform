import { FilterX, ScrollText, Search } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  ActivityList,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchFilterBar,
} from "@/components/ui/admin-ui";
import {
  IconTextButton,
  IconTextLink,
} from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { logServerTiming, measure } from "@/lib/perf/server-timing";
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

  const [total, rows, actions] = await measure("data", () =>
    Promise.all([
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
    ]),
  );
  logServerTiming();

  const qs = new URLSearchParams();
  if (params.action) qs.set("action", params.action);
  if (params.organizationId) qs.set("organizationId", params.organizationId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);

  const hasFilter = Boolean(
    params.action || params.organizationId || params.from || params.to,
  );

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.auditTitle}
        description={TH.pages.auditBody}
        icon={<ScrollText size={24} />}
      />
      <section className="card">
        <SearchFilterBar
          resultLabel={`${TH.common.foundTotal} ${total} ${TH.common.items}`}
        >
          <form method="get" className="flex w-full flex-wrap items-end gap-2">
            <label className="text-[length:var(--text-label)]">
              <span className="mb-1 block font-medium">{TH.audit.action}</span>
              <select
                name="action"
                defaultValue={params.action ?? ""}
                className="select !w-auto min-w-[10rem]"
              >
                <option value="">ทุกประเภท</option>
                {actions.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.nameTh}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[length:var(--text-label)]">
              <span className="mb-1 block font-medium">{TH.audit.dateFrom}</span>
              <input
                type="date"
                name="from"
                defaultValue={params.from ?? ""}
                className="input !w-auto"
              />
            </label>
            <label className="text-[length:var(--text-label)]">
              <span className="mb-1 block font-medium">{TH.audit.dateTo}</span>
              <input
                type="date"
                name="to"
                defaultValue={params.to ?? ""}
                className="input !w-auto"
              />
            </label>
            <IconTextButton
              type="submit"
              label={TH.common.filter}
              icon={<Search className="size-5" />}
            />
            {hasFilter ? (
              <IconTextLink
                href="/audit-logs"
                variant="outline"
                label={TH.common.clearFilter}
                icon={<FilterX className="size-5" />}
              />
            ) : null}
          </form>
        </SearchFilterBar>

        {rows.length === 0 ? (
          <EmptyState title={TH.common.empty} body={TH.common.notFound} />
        ) : (
          <>
            <div className="md:hidden">
              <ActivityList
                items={rows.map((row) => ({
                  id: row.id,
                  title: row.actionType.nameTh,
                  meta: `${row.organization?.displayName ?? "-"} · ${row.entityType}`,
                  when: row.createdAt.toLocaleString("th-TH"),
                }))}
              />
            </div>
            <DataTable
              headers={[
                TH.audit.action,
                TH.audit.organization,
                TH.audit.entity,
                "วันเวลา",
              ]}
            >
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-3 py-2.5 font-medium">
                    {row.actionType.nameTh}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.organization?.displayName ?? "-"}
                  </td>
                  <td className="px-3 py-2.5 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                    {row.entityType}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[length:var(--text-helper)]">
                    {row.createdAt.toLocaleString("th-TH")}
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
