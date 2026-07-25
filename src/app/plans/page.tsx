import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconPlus } from "@/components/ui/icons";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { listPlans } from "@/lib/platform/plans-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; status?: string }>;
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
  if (!perms.includes(PLATFORM_PERMISSIONS.planRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }
  const sp = await searchParams;
  const [{ rows }, products] = await Promise.all([
    listPlans(prisma, actor, {
      productId: sp.productId,
      statusCode: sp.status,
      take: 100,
    }),
    prisma.product.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
      take: 100,
    }),
  ]);
  const canManage = perms.includes(PLATFORM_PERMISSIONS.planManage);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.plansTitle}
        description={TH.pages.plansBody}
        actions={
          canManage ? (
            <Link href="/plans/new" className="btn-primary">
              <IconPlus size={16} /> เพิ่มแพ็กเกจ
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <select
          name="productId"
          defaultValue={sp.productId ?? ""}
          className="input max-w-xs"
        >
          <option value="">ทุกผลิตภัณฑ์</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code}
            </option>
          ))}
        </select>
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
            {rows.map((p) => {
              const latest = p.versions[0];
              return (
                <li key={p.id}>
                  <Link href={`/plans/${p.id}`} className="block">
                    <MobileRecordCard
                      title={p.name}
                      subtitle={`${p.product.code} · ${p.code}`}
                      status={
                        <StatusBadge
                          label={labelStatus(p.status.code)}
                          code={p.status.code}
                        />
                      }
                      meta={
                        latest
                          ? `v${latest.versionNumber} · ${Number(latest.priceAmount).toLocaleString("th-TH")} ${latest.currency} · ${p._count.subscriptions} การสมัคร`
                          : `${p._count.subscriptions} การสมัคร`
                      }
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PlatformShell>
  );
}
