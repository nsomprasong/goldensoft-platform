import Link from "next/link";
import { Building2, FilterX, Plus, Search } from "lucide-react";

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
import {
  IconTextButton,
  IconTextLink,
} from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH, labelStatus } from "@/lib/i18n/th";
import { logServerTiming, measure } from "@/lib/perf/server-timing";
import {
  canCreateOrganization,
  listOrganizationsForActor,
} from "@/lib/platform/organizations-admin";
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
  const { total, rows } = await measure("data", () =>
    listOrganizationsForActor(prisma, actor, {
      q: params.q,
      statusCode: params.status,
      skip: (page - 1) * take,
      take,
    }),
  );
  logServerTiming();

  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  const prevQs = new URLSearchParams(qs);
  prevQs.set("page", String(page - 1));
  const nextQs = new URLSearchParams(qs);
  nextQs.set("page", String(page + 1));

  const canCreate = canCreateOrganization(actor);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.organizationsTitle}
        description={TH.pages.organizationsBody}
        icon={<Building2 size={24} />}
        actions={
          canCreate ? (
            <IconTextLink
              href="/organizations/new"
              label={TH.org.add}
              icon={<Plus className="size-5" />}
            />
          ) : null
        }
      />

      <section className="card">
        <SearchFilterBar
          resultLabel={`${TH.common.foundTotal} ${total} ${TH.common.items}`}
        >
          <form className="flex w-full flex-wrap items-end gap-2" method="get">
            <label className="min-w-[12rem] flex-1 text-[length:var(--text-label)]">
              <span className="mb-1 block font-medium">{TH.common.search}</span>
              <Input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder={TH.common.search}
                aria-label={TH.common.search}
              />
            </label>
            <label className="text-[length:var(--text-label)]">
              <span className="mb-1 block font-medium">{TH.common.status}</span>
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="select !w-auto min-w-[9rem]"
              >
                <option value="">ทั้งหมด</option>
                <option value="ACTIVE">{labelStatus("ACTIVE")}</option>
                <option value="SUSPENDED">{labelStatus("SUSPENDED")}</option>
                <option value="CLOSED">{labelStatus("CLOSED")}</option>
              </select>
            </label>
            <IconTextButton
              type="submit"
              label={TH.common.filter}
              icon={<Search className="size-5" />}
            />
            {params.q || params.status ? (
              <IconTextLink
                href="/organizations"
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
            <ul className="space-y-3 md:hidden">
              {rows.map((org) => (
                <li key={org.id}>
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/organizations/${org.id}`}
                        className="font-medium text-[var(--primary)]"
                      >
                        {org.displayName}
                      </Link>
                      <StatusBadge
                        label={labelStatus(org.status.code)}
                        code={org.status.code}
                      />
                    </div>
                    <p className="mt-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {org.customerCode} · {org._count.branches} {TH.nav.branches}
                    </p>
                    <div className="mt-3">
                      <Link
                        href={`/organizations/${org.id}/branches`}
                        className="text-[length:var(--text-helper)] font-medium text-[var(--primary)]"
                      >
                        {TH.nav.branches}
                      </Link>
                    </div>
                  </div>
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
                <tr
                  key={org.id}
                  className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]/60"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/organizations/${org.id}`}
                      className="font-medium text-[var(--primary)]"
                    >
                      {org.displayName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                    {org.customerCode}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      label={labelStatus(org.status.code)}
                      code={org.status.code}
                    />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{org._count.branches}</td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/organizations/${org.id}/branches`}
                      className="text-[length:var(--text-helper)] text-[var(--primary)]"
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
