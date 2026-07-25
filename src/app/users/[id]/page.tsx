import Link from "next/link";
import { notFound } from "next/navigation";

import { PlatformShell } from "@/components/platform-shell";
import { ResendInviteButton } from "@/components/resend-invite-button";
import { AccessDenied, PageHeader, StatusBadge } from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import {
  TH,
  labelInvitationStatus,
  labelRole,
} from "@/lib/i18n/th";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UserInvitationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const permissions = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: ctx.bundle.memberships.map((membership) => ({
      id: membership.organizationId,
      name: membership.organizationName,
    })),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };
  if (!permissions.includes(PLATFORM_PERMISSIONS.userRead)) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const { id } = await params;
  const invitation = await prisma.userInvitation.findUnique({
    where: { id },
    select: {
      id: true,
      emailNormalized: true,
      displayName: true,
      branchIdsJson: true,
      createdAt: true,
      authInviteSentAt: true,
      attemptCount: true,
      organization: { select: { id: true, displayName: true } },
      organizationRole: { select: { code: true } },
      branchScopeType: { select: { code: true } },
      status: { select: { code: true } },
      invitedByProfile: { select: { displayName: true } },
    },
  });
  if (!invitation) notFound();
  const canReadAll =
    actor.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN) ||
    actor.platformRoles.includes(MASTER.platformRole.SUPPORT);
  if (
    !canReadAll &&
    !actor.membershipOrganizationIds.includes(invitation.organization.id)
  ) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }
  const branchIds = Array.isArray(invitation.branchIdsJson)
    ? invitation.branchIdsJson.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const branches =
    branchIds.length > 0
      ? await prisma.branch.findMany({
          where: {
            id: { in: branchIds },
            organizationId: invitation.organization.id,
          },
          select: { code: true, name: true },
        })
      : [];
  const canResend =
    permissions.includes(PLATFORM_PERMISSIONS.userInvite) &&
    ["PENDING", "AUTH_SENT", "FAILED", "PLATFORM_SETUP_FAILED"].includes(
      invitation.status.code,
    );

  return (
    <PlatformShell {...shellProps}>
      <section className="card max-w-3xl">
        <PageHeader
          title="รายละเอียดคำเชิญผู้ใช้งาน"
          actions={
            <div className="flex gap-2">
              {canResend ? (
                <ResendInviteButton invitationId={invitation.id} />
              ) : null}
              <Link href="/users" className="btn !bg-slate-600">
                {TH.common.back}
              </Link>
            </div>
          }
        />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">ชื่อ</dt><dd>{invitation.displayName}</dd></div>
          <div><dt className="text-slate-500">อีเมล</dt><dd>{invitation.emailNormalized}</dd></div>
          <div><dt className="text-slate-500">องค์กร</dt><dd>{invitation.organization.displayName}</dd></div>
          <div><dt className="text-slate-500">บทบาท</dt><dd>{labelRole(invitation.organizationRole.code)}</dd></div>
          <div><dt className="text-slate-500">ขอบเขตสาขา</dt><dd>{invitation.branchScopeType.code}</dd></div>
          <div><dt className="text-slate-500">สาขา</dt><dd>{branches.map((branch) => `${branch.name} (${branch.code})`).join(", ") || "-"}</dd></div>
          <div><dt className="text-slate-500">วันที่เชิญ</dt><dd>{invitation.createdAt.toLocaleString("th-TH")}</dd></div>
          <div><dt className="text-slate-500">ผู้เชิญ</dt><dd>{invitation.invitedByProfile.displayName}</dd></div>
          <div><dt className="text-slate-500">จำนวนครั้งที่ส่ง</dt><dd>{invitation.attemptCount}</dd></div>
          <div><dt className="text-slate-500">สถานะ</dt><dd><StatusBadge label={labelInvitationStatus(invitation.status.code)} /></dd></div>
        </dl>
      </section>
    </PlatformShell>
  );
}
