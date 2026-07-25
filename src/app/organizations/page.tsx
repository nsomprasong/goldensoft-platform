import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchFilterBar,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH, labelStatus } from "@/lib/i18n/th";
import { listOrganizationsForActor } from "@/lib/platform/organizations-admin";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
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

  if (!perms.includes(PLATFORM_PERMISSIONS.organizationRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const take = 20;
  const { total, rows } = await listOrganizationsForActor(prisma, actor, {
    q: params.q,
    statusCode: params.status,
    skip: (page - 1) * take,
    take,
  });

  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  const prevQs = new URLSearchParams(qs);
  prevQs.set("page", String(page - 1));
  const nextQs = new URLSearchParams(qs);
  nextQs.set("page", String(page + 1));

  const canCreate = actor.platformRoles.includes("SUPER_ADMIN");

  return (
    <PlatformShell {...shellProps}>
      <section className="card">
        <PageHeader
          title={TH.pages.organizationsTitle}
          actions={
            canCreate ? (
              <Link href="/organizations/new" className="btn">
                {TH.org.add}
              </Link>
            ) : null
          }
        />

        <SearchFilterBar>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder={TH.common.search}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <option value="">ทั้งหมด</option>
              <option value="ACTIVE">{labelStatus("ACTIVE")}</option>
              <option value="SUSPENDED">{labelStatus("SUSPENDED")}</option>
              <option value="CLOSED">{labelStatus("CLOSED")}</option>
            </select>
            <button type="submit" className="btn">
              {TH.common.filter}
            </button>
          </form>
        </SearchFilterBar>

        {rows.length === 0 ? (
          <EmptyState title={TH.common.empty} body={TH.common.notFound} />
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {rows.map((org) => (
                <li key={org.id} className="rounded-xl border border-[var(--border)] p-3">
                  <Link
                    href={`/organizations/${org.id}`}
                    className="font-medium text-[var(--accent)]"
                  >
                    {org.displayName}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {org.customerCode} · {org._count.branches} {TH.nav.branches}
                  </p>
                  <StatusBadge label={labelStatus(org.status.code)} />
                </li>
              ))}
            </ul>

            <DataTable
              headers={[
                TH.org.nameTh,
                TH.org.code,
                TH.common.status,
                TH.nav.branches,
                TH.common.actions,
              ]}
            >
              {rows.map((org) => (
                <tr key={org.id} className="border-b border-[var(--border)]">
                  <td className="px-2 py-2">
                    <Link
                      href={`/organizations/${org.id}`}
                      className="text-[var(--accent)]"
                    >
                      {org.displayName}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{org.customerCode}</td>
                  <td className="px-2 py-2">
                    <StatusBadge label={labelStatus(org.status.code)} />
                  </td>
                  <td className="px-2 py-2">{org._count.branches}</td>
                  <td className="px-2 py-2">
                    <Link
                      href={`/organizations/${org.id}/branches`}
                      className="text-sm text-[var(--accent)]"
                    >
                      {TH.nav.branches}
                    </Link>
                  </td>
                </tr>
              ))}
            </DataTable>

            <Pagination
              page={page}
              pageSize={take}
              total={total}
              previousHref={page > 1 ? `?${prevQs.toString()}` : null}
              nextHref={page * take < total ? `?${nextQs.toString()}` : null}
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
