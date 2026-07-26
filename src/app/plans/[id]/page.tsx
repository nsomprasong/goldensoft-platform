import { ArrowLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";

import { PlanStatusActions } from "@/components/plan-form";
import { PlatformShell } from "@/components/platform-shell";
import {
  AccessDenied,
  DetailList,
  PageHeader,
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
import { getPlan } from "@/lib/platform/plans-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PlanDetailPage({
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
  if (!perms.includes(PLATFORM_PERMISSIONS.planRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }
  const { id } = await params;
  let plan;
  try {
    plan = await getPlan(prisma, id);
  } catch {
    notFound();
  }
  const canManage = perms.includes(PLATFORM_PERMISSIONS.planManage);
  const latest = plan.versions[0];

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={plan.name}
        description={`${plan.product.code} · ${plan.code}`}
        status={
          <StatusBadge
            label={labelStatus(plan.status.code)}
            code={plan.status.code}
          />
        }
        actions={
          <div className="flex flex-wrap items-start gap-3">
            <IconTextLink
              href="/plans"
              variant="outline"
              label={TH.common.back}
              icon={<ArrowLeft className="size-5" />}
            />
            {canManage ? (
              <IconTextLink
                href={`/plans/${plan.id}/edit`}
                label={TH.common.edit}
                icon={<Pencil className="size-5" />}
              />
            ) : null}
          </div>
        }
      />
      <section className="card space-y-4">
        <DetailList
          items={[
            { label: "ผลิตภัณฑ์", value: plan.product.code },
            { label: "รหัส", value: plan.code },
            { label: "ชื่อ", value: plan.name },
            { label: "คำอธิบาย", value: plan.description ?? "—" },
            { label: "ลำดับ", value: String(plan.sortOrder) },
            { label: "การสมัคร", value: String(plan._count.subscriptions) },
            {
              label: "เวอร์ชันล่าสุด",
              value: latest
                ? `v${latest.versionNumber} · ${Number(latest.priceAmount).toLocaleString("th-TH")} ${latest.currency}`
                : "—",
            },
          ]}
        />
        {canManage ? (
          <PlanStatusActions planId={plan.id} statusCode={plan.status.code} />
        ) : null}
        <div>
          <h3 className="mb-2 text-sm font-semibold">ประวัติเวอร์ชัน</h3>
          <ul className="space-y-2 text-sm">
            {plan.versions.map((v) => (
              <li key={v.id} className="rounded border border-[var(--border)] p-2">
                v{v.versionNumber} · {labelStatus(v.status.code)} ·{" "}
                {Number(v.priceAmount).toLocaleString("th-TH")} {v.currency} ·{" "}
                {v.billingCycleDefault.nameTh}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </PlatformShell>
  );
}
