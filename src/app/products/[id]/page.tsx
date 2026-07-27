import Link from "next/link";
import { ArrowLeft, Layers, Pencil, Plus } from "lucide-react";
import { notFound } from "next/navigation";

import { ProductStatusActions } from "@/components/product-form";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { getProduct } from "@/lib/platform/products-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  const { id } = await params;
  let product;
  try {
    product = await getProduct(prisma, id);
  } catch {
    notFound();
  }
  const canManageProduct = perms.includes(PLATFORM_PERMISSIONS.productManage);
  const canReadPlans = perms.includes(PLATFORM_PERMISSIONS.planRead);
  const canManagePlans = perms.includes(PLATFORM_PERMISSIONS.planManage);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={product.nameTh ?? product.name}
        description={product.code}
        status={
          <StatusBadge
            label={labelStatus(product.status.code)}
            code={product.status.code}
          />
        }
        actions={
          <div className="flex flex-wrap items-start gap-3">
            <IconTextLink
              href="/products"
              variant="outline"
              label={TH.common.back}
              icon={<ArrowLeft className="size-5" />}
            />
            {canManageProduct ? (
              <IconTextLink
                href={`/products/${product.id}/edit`}
                label={TH.common.edit}
                icon={<Pencil className="size-5" />}
              />
            ) : null}
          </div>
        }
      />
      <section className="card mb-4 space-y-4">
        <DetailList
          items={[
            { label: "รหัส", value: product.code },
            { label: "ชื่อไทย", value: product.nameTh ?? product.name },
            { label: "ชื่ออังกฤษ", value: product.nameEn ?? "—" },
            { label: "ประเภท", value: product.productType },
            { label: "ลำดับ", value: String(product.sortOrder) },
            { label: "แพ็กเกจ", value: String(product._count.plans) },
            {
              label: "การสมัคร",
              value: String(product._count.subscriptions),
            },
            { label: "คำอธิบาย", value: product.description ?? "—" },
          ]}
        />
        {canManageProduct ? (
          <ProductStatusActions
            productId={product.id}
            statusCode={product.status.code}
          />
        ) : null}
      </section>

      {canReadPlans ? (
        <section id="plans" className="card scroll-mt-24 space-y-4">
          <SectionHeader
            title="แพ็กเกจของผลิตภัณฑ์นี้"
            description={`ทั้งหมด ${product.plans.length} รายการ`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <IconTextLink
                  href={`/plans?productId=${product.id}&status=`}
                  variant="outline"
                  size="sm"
                  label="ดูในหน้าแพ็กเกจ"
                  icon={<Layers className="size-4" />}
                />
                {canManagePlans ? (
                  <IconTextLink
                    href={`/plans/new?productId=${product.id}`}
                    size="sm"
                    label="เพิ่มแพ็กเกจ"
                    icon={<Plus className="size-4" />}
                  />
                ) : null}
              </div>
            }
          />
          {product.plans.length === 0 ? (
            <EmptyState
              title="ยังไม่มีแพ็กเกจ"
              body="สร้างแพ็กเกจสำหรับผลิตภัณฑ์นี้เพื่อให้ลูกค้าเลือกสมัครได้"
              action={
                canManagePlans ? (
                  <IconTextLink
                    href={`/plans/new?productId=${product.id}`}
                    label="เพิ่มแพ็กเกจ"
                    icon={<Plus className="size-5" />}
                  />
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {product.plans.map((plan) => {
                const latest = plan.versions[0];
                return (
                  <li key={plan.id}>
                    <Link href={`/plans/${plan.id}`} className="block">
                      <MobileRecordCard
                        title={plan.name}
                        subtitle={plan.code}
                        status={
                          <StatusBadge
                            label={labelStatus(plan.status.code)}
                            code={plan.status.code}
                          />
                        }
                        meta={
                          latest
                            ? `v${latest.versionNumber} · ${Number(latest.priceAmount).toLocaleString("th-TH")} ${latest.currency} · ${plan._count.subscriptions} การสมัคร`
                            : `${plan._count.subscriptions} การสมัคร`
                        }
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </PlatformShell>
  );
}
