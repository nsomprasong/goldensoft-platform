import Link from "next/link";
import { Layers, Plus, Search } from "lucide-react";

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
  const statusFilter = sp.status ?? "ACTIVE";
  const [{ rows }, products] = await Promise.all([
    listPlans(prisma, actor, {
      productId: sp.productId,
      statusCode: statusFilter || undefined,
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
        icon={<Layers size={24} />}
        actions={
          canManage ? (
            <IconTextLink
              href="/plans/new"
              label="เพิ่มแพ็กเกจ"
              icon={<Plus className="size-5" />}
            />
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
