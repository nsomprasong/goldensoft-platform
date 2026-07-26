import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/product-form";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { getProduct } from "@/lib/platform/products-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
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
  if (!perms.includes(PLATFORM_PERMISSIONS.productManage)) {
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
  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={`แก้ไข ${product.nameTh ?? product.name}`}
        actions={
          <IconTextLink
            href={`/products/${product.id}`}
            variant="outline"
            label={TH.common.back}
            icon={<ArrowLeft className="size-5" />}
          />
        }
      />
      <section className="card max-w-2xl">
        <ProductForm
          mode="edit"
          productId={product.id}
          initial={{
            code: product.code,
            nameTh: product.nameTh ?? product.name,
            nameEn: product.nameEn ?? product.name,
            description: product.description,
            productType: product.productType,
            sortOrder: product.sortOrder,
          }}
        />
      </section>
    </PlatformShell>
  );
}
