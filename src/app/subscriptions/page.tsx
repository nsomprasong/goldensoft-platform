import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  EmptyState,
  MobileRecordCard,
  PageHeader,
  StatusBadge,
} from "@/components/ui/admin-ui";
import { IconPlus, IconSubscription } from "@/components/ui/icons";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { labelStatus, TH } from "@/lib/i18n/th";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { listSubscriptionsForActor } from "@/lib/platform/subscriptions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string; status?: string }>;
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
  if (!perms.includes(PLATFORM_PERMISSIONS.subscriptionRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }
  const sp = await searchParams;
  const { rows } = await listSubscriptionsForActor(prisma, actor, {
    organizationId: sp.organizationId,
    statusCode: sp.status,
    take: 100,
  });
  const canManage = perms.includes(PLATFORM_PERMISSIONS.subscriptionManage);

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.subscriptionsTitle}
        description={TH.pages.subscriptionsBody}
        icon={<IconSubscription size={24} />}
        actions={
          canManage ? (
            <Link href="/subscriptions/new" className="btn-primary">
              <IconPlus size={16} /> สร้างการสมัคร
            </Link>
          ) : null
        }
      />
      <section className="card">
        {rows.length === 0 ? (
          <EmptyState title={TH.common.empty} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/subscriptions/${s.id}`} className="block">
                  <MobileRecordCard
                    title={s.organization.displayName}
                    subtitle={`${s.product.code} · ${s.plan.code}`}
                    status={
                      <StatusBadge
                        label={labelStatus(s.status.code)}
                        code={s.status.code}
                      />
                    }
                    meta={s.billingCycle.nameTh}
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
