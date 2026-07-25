import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ProductStatusActions,
} from "@/components/product-form";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
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
  const canManage = perms.includes(PLATFORM_PERMISSIONS.productManage);

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
          <div className="flex flex-wrap gap-2">
            <Link href="/products" className="btn-secondary">
              {TH.common.back}
            </Link>
            {canManage ? (
              <Link href={`/products/${product.id}/edit`} className="btn-primary">
                {TH.common.edit}
              </Link>
            ) : null}
          </div>
        }
      />
      <section className="card space-y-4">
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
        {canManage ? (
          <ProductStatusActions
            productId={product.id}
            statusCode={product.status.code}
          />
        ) : null}
      </section>
    </PlatformShell>
  );
}
