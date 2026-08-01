import Link from "next/link";
import { Layers, Package, Plus, Search } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import {
  IconTextButton,
  IconTextLink,
} from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { labelStatus, TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { listProducts } from "@/lib/platform/products-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  if (!perms.includes(PLATFORM_PERMISSIONS.productRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const sp = await searchParams;
  const statusFilter = sp.status ?? "ACTIVE";
  const { rows } = await listProducts(prisma, actor, {
    q: sp.q,
    statusCode: statusFilter || undefined,
    take: 100,
  });
  const canManage = perms.includes(PLATFORM_PERMISSIONS.productManage);
  const canReadPlans = perms.includes(PLATFORM_PERMISSIONS.planRead);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.productsTitle}
        description={TH.pages.productsBody}
        icon={<Package size={24} />}
        actions={
          canManage ? (
            <IconTextLink
              href="/products/new"
              label="เพิ่มผลิตภัณฑ์"
              icon={<Plus className="size-5" />}
            />
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={TH.common.search}
          className="max-w-xs"
        />
        <select
          name="status"
          defaultValue={statusFilter}
          className="input max-w-[10rem]"
        >
          <option value="ACTIVE">ใช้งาน</option>
          <option value="RETIRED">เลิกใช้</option>
          <option value="">ทุกสถานะ</option>
        </select>
        <IconTextButton
          type="submit"
          variant="outline"
          label={TH.common.filter}
          icon={<Search className="size-5" />}
        />
      </form>
      <section className="card">
        {rows.length === 0 ? (
          <EmptyState title={TH.common.empty} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((p) => (
              <li key={p.id}>
                <MobileRecordCard
                  title={
                    <Link
                      href={`/products/${p.id}`}
                      className="transition-colors hover:text-[var(--primary)]"
                    >
                      {p.nameTh ?? p.name}
                    </Link>
                  }
                  subtitle={p.code}
                  status={
                    <StatusBadge
                      label={labelStatus(p.status.code)}
                      code={p.status.code}
                    />
                  }
                  meta={`${p._count.plans} ${TH.nav.plans} · ${p._count.subscriptions} การสมัคร`}
                  actions={
                    canReadPlans ? (
                      <IconTextLink
                        href={`/products/${p.id}#plans`}
                        size="sm"
                        label={`ดูแพ็กเกจ (${p._count.plans})`}
                        icon={<Layers className="size-3.5" />}
                      />
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PlatformShell>
  );
}
