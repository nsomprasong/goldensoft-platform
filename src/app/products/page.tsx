import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconPlus, IconProducts } from "@/components/ui/icons";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
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
    organizations: ctx.bundle.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
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
  const { rows } = await listProducts(prisma, actor, {
    q: sp.q,
    statusCode: sp.status,
    take: 100,
  });
  const canManage = perms.includes(PLATFORM_PERMISSIONS.productManage);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.productsTitle}
        description={TH.pages.productsBody}
        icon={<IconProducts size={24} />}
        actions={
          canManage ? (
            <Link href="/products/new" className="btn-primary">
              <IconPlus size={16} /> เพิ่มผลิตภัณฑ์
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={TH.common.search}
          className="input max-w-xs"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="input max-w-[10rem]"
        >
          <option value="">ทุกสถานะ</option>
          <option value="ACTIVE">ใช้งาน</option>
          <option value="RETIRED">เลิกใช้</option>
        </select>
        <button type="submit" className="btn-secondary">
          {TH.common.filter}
        </button>
      </form>
      <section className="card">
        {rows.length === 0 ? (
          <EmptyState title={TH.common.empty} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/products/${p.id}`} className="block">
                  <MobileRecordCard
                    title={p.nameTh ?? p.name}
                    subtitle={p.code}
                    status={
                      <StatusBadge
                        label={labelStatus(p.status.code)}
                        code={p.status.code}
                      />
                    }
                    meta={`${p._count.plans} ${TH.nav.plans} · ${p._count.subscriptions} การสมัคร`}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PlatformShell>
  );
}
