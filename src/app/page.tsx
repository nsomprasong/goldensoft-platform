import {
  Building2,
  GitBranch,
  LayoutDashboard,
  Mail,
  Plus,
  ScrollText,
  Users,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";

import { SectionCard } from "@/components/goldensoft/page";
import { PlatformShell } from "@/components/platform-shell";
import { IconTextLink } from "@/components/ui/labeled-icon-button";
import {
  ActivityList,
  EmptyState,
  StatCard,
} from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";
import { logServerTiming, measure } from "@/lib/perf/server-timing";
import { MASTER } from "@/lib/platform/master-codes";
import {
  PLATFORM_PERMISSIONS,
  permissionsForRoles,
} from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

function greetingForHour(hour: number): string {
  if (hour < 12) return TH.pages.greetingMorning;
  if (hour < 18) return TH.pages.greetingAfternoon;
  return TH.pages.greetingEvening;
}

export default async function DashboardPage() {
  const ctx = await requirePlatformPage();
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const perms = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });
  const isSuper = actor.platformRoles.includes("SUPER_ADMIN");
  const orgIds =
    ctx.contextMode === "platform_admin" && isSuper
      ? undefined
      : ctx.activeOrganization?.id
        ? [ctx.activeOrganization.id]
        : isSuper
          ? undefined
          : ctx.bundle.memberships.map((m) => m.organizationId);

  const orgWhere = orgIds ? { id: { in: orgIds } } : {};
  const branchWhere = orgIds ? { organizationId: { in: orgIds } } : {};
  const membershipWhere = orgIds
    ? { organizationId: { in: orgIds }, endedAt: null }
    : { endedAt: null };
  const inviteWhere = {
    isActive: true,
    status: {
      code: {
        in: [
          MASTER.userInvitationStatus.PENDING,
          MASTER.userInvitationStatus.AUTH_SENT,
          MASTER.userInvitationStatus.PLATFORM_SETUP_FAILED,
          MASTER.userInvitationStatus.FAILED,
        ],
      },
    },
    ...(orgIds ? { organizationId: { in: orgIds } } : {}),
  };
  const subscriptionWhere = {
    status: {
      code: {
        in: [
          MASTER.subscriptionStatus.ACTIVE,
          MASTER.subscriptionStatus.TRIAL,
          MASTER.subscriptionStatus.PAST_DUE,
          MASTER.subscriptionStatus.SUSPENDED,
        ],
      },
    },
    ...(orgIds ? { organizationId: { in: orgIds } } : {}),
  };

  const [
    organizationCount,
    branchCount,
    userCount,
    pendingInviteCount,
    activeSubscriptionCount,
    recentAudits,
  ] = await measure("data", () =>
    Promise.all([
      perms.includes(PLATFORM_PERMISSIONS.organizationRead)
        ? prisma.organization.count({ where: { ...orgWhere, deletedAt: null } })
        : Promise.resolve(0),
      perms.includes(PLATFORM_PERMISSIONS.branchRead)
        ? prisma.branch.count({ where: { ...branchWhere, deletedAt: null } })
        : Promise.resolve(0),
      perms.includes(PLATFORM_PERMISSIONS.userRead)
        ? prisma.organizationMembership.count({ where: membershipWhere })
        : Promise.resolve(0),
      perms.includes(PLATFORM_PERMISSIONS.userRead)
        ? prisma.userInvitation.count({ where: inviteWhere })
        : Promise.resolve(0),
      perms.includes(PLATFORM_PERMISSIONS.subscriptionRead)
        ? prisma.subscription.count({ where: subscriptionWhere })
        : Promise.resolve(0),
      perms.includes(PLATFORM_PERMISSIONS.auditRead)
        ? prisma.auditLog.findMany({
            where: orgIds ? { organizationId: { in: orgIds } } : undefined,
            orderBy: { createdAt: "desc" },
            take: 6,
            select: {
              id: true,
              createdAt: true,
              actionType: { select: { nameTh: true, code: true } },
              organization: { select: { displayName: true } },
            },
          })
        : Promise.resolve([]),
    ]),
  );
  logServerTiming();

  const hour = new Date().getHours();
  const canCreateOrg =
    isSuper || perms.includes(PLATFORM_PERMISSIONS.organizationCreate);
  const canInvite =
    Boolean(ctx.activeOrganization) &&
    perms.includes(PLATFORM_PERMISSIONS.userInvite);
  const canCreateBranch =
    Boolean(ctx.activeOrganization) &&
    perms.includes(PLATFORM_PERMISSIONS.branchManage);
  const canReadAudit = perms.includes(PLATFORM_PERMISSIONS.auditRead);
  const displayName = ctx.bundle.profile?.displayName ?? TH.common.user;

  const shellProps = {
    displayName,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: ctx.bundle.memberships.map((m) => ({
      id: m.organizationId,
      name: m.organizationName,
    })),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    pageTitle: TH.pages.dashboardTitle,
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };

  // Sales staff with an empty portfolio should land on “create customer org”
  // rather than invite (invite requires an active managed organization).
  const primaryAction = canCreateOrg && !ctx.activeOrganization
    ? {
        href: "/organizations/new",
        title: TH.org.add,
        body: "สร้างองค์กรใหม่บนแพลตฟอร์ม",
        icon: <Building2 size={20} />,
      }
    : canInvite
      ? {
          href: "/users/invite",
          title: TH.users.invite,
          body: "ส่งคำเชิญและกำหนดบทบาทให้ผู้ใช้ใหม่",
          icon: <Users size={20} />,
        }
      : canCreateOrg
        ? {
            href: "/organizations/new",
            title: TH.org.add,
            body: "สร้างองค์กรใหม่บนแพลตฟอร์ม",
            icon: <Building2 size={20} />,
          }
        : null;

  const secondaryActions = [
    canCreateOrg && primaryAction?.href !== "/organizations/new"
      ? {
          href: "/organizations/new",
          title: TH.org.add,
          body: "สร้างองค์กรใหม่บนแพลตฟอร์ม",
          icon: <Plus size={18} />,
        }
      : null,
    canCreateBranch && ctx.activeOrganization
      ? {
          href: `/organizations/${ctx.activeOrganization.id}/branches/new`,
          title: TH.branch.add,
          body: "เพิ่มสาขาในองค์กรที่ใช้งานอยู่",
          icon: <GitBranch size={18} />,
        }
      : null,
    canInvite && primaryAction?.href !== "/users/invite"
      ? {
          href: "/users/invite",
          title: TH.users.invite,
          body: "ส่งคำเชิญและกำหนดบทบาท",
          icon: <Users size={18} />,
        }
      : null,
    canReadAudit
      ? {
          href: "/audit-logs",
          title: TH.nav.auditLogs,
          body: "ติดตามเหตุการณ์สำคัญล่าสุด",
          icon: <ScrollText size={18} />,
        }
      : null,
  ].filter(Boolean) as Array<{
    href: string;
    title: string;
    body: string;
    icon: ReactNode;
  }>;

  return (
    <PlatformShell {...shellProps}>
      <section className="dashboard-hero mb-5 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--page-header-border)] shadow-[var(--shadow-md)]">
        <div className="dashboard-hero-surface relative px-4 py-5 sm:px-6 sm:py-7">
          <div
            className="dashboard-hero-orb pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full"
            aria-hidden="true"
          />
          <div
            className="dashboard-hero-orb-secondary pointer-events-none absolute -bottom-12 left-8 h-32 w-32 rounded-full"
            aria-hidden="true"
          />
          <div
            className="dashboard-hero-accent pointer-events-none absolute bottom-0 left-0 h-1 w-full"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <div
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-gradient-to-br from-white to-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-md)] ring-1 ring-[var(--page-header-border)]"
                aria-hidden="true"
              >
                <LayoutDashboard size={24} />
              </div>
              <div className="min-w-0">
                <p className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[0.08em] text-[var(--primary)]">
                  {TH.shellName}
                </p>
                <h1 className="mt-1 text-[length:var(--text-page)] font-semibold leading-[var(--leading-tight)] text-[var(--text-primary)]">
                  {greetingForHour(hour)} {displayName}
                </h1>
                <p className="mt-1.5 max-w-2xl text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                  {TH.pages.dashboardBody}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-[var(--page-header-border)] bg-white/80 px-2.5 py-1 text-[length:var(--text-caption)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)]">
                    {TH.common.currentOrganization}:{" "}
                    <strong className="ml-1 text-[var(--text-primary)]">
                      {ctx.activeOrganization?.name ?? TH.common.notFound}
                    </strong>
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[var(--page-header-border)] bg-white/80 px-2.5 py-1 text-[length:var(--text-caption)] text-[var(--text-secondary)] shadow-[var(--shadow-xs)]">
                    {TH.common.currentBranch}:{" "}
                    <strong className="ml-1 text-[var(--text-primary)]">
                      {ctx.activeBranch?.name ?? TH.common.noBranch}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-summary" aria-label="สรุปสถานะ">
        <div className="dashboard-stat-grid">
          {perms.includes(PLATFORM_PERMISSIONS.organizationRead) ? (
            <StatCard
              label={TH.nav.organizations}
              value={organizationCount}
              hint="องค์กรในขอบเขตของคุณ"
              href="/organizations"
              accent="blue"
              icon={<Building2 size={22} />}
            />
          ) : null}
          {perms.includes(PLATFORM_PERMISSIONS.branchRead) ? (
            <StatCard
              label={TH.nav.branches}
              value={branchCount}
              hint="สาขาที่มองเห็นได้"
              href="/branches"
              accent="green"
              icon={<GitBranch size={22} />}
            />
          ) : null}
          {perms.includes(PLATFORM_PERMISSIONS.userRead) ? (
            <StatCard
              label={TH.nav.users}
              value={userCount}
              hint="สมาชิกองค์กรที่ยังใช้งาน"
              href="/users"
              accent="violet"
              icon={<Users size={22} />}
            />
          ) : null}
          {perms.includes(PLATFORM_PERMISSIONS.subscriptionRead) ? (
            <StatCard
              label={TH.pages.activeSubscriptions}
              value={activeSubscriptionCount}
              hint="สถานะใช้งาน / ทดลอง / ค้างชำระ"
              href="/subscriptions"
              accent="amber"
              icon={<WalletCards size={22} />}
            />
          ) : null}
        </div>

        {perms.includes(PLATFORM_PERMISSIONS.userRead) ? (
          <div className="dashboard-stat-grid mt-3">
            <StatCard
              label={TH.pages.pendingInvites}
              value={pendingInviteCount}
              hint="คำเชิญที่รอการตอบรับหรือส่งซ้ำ"
              href="/users"
              accent="orange"
              icon={<Mail size={22} />}
            />
          </div>
        ) : null}
      </section>

      <div className="dashboard-panels mt-5">
        <SectionCard
          title={TH.pages.quickActions}
          description="ทางลัดตามสิทธิ์ปัจจุบันของคุณ"
        >
          <div className="flex flex-wrap items-start gap-3">
            {primaryAction ? (
              <IconTextLink
                href={primaryAction.href}
                label={primaryAction.title}
                icon={primaryAction.icon}
              />
            ) : null}
            {secondaryActions.map((action) => (
              <IconTextLink
                key={action.href + action.title}
                href={action.href}
                variant="outline"
                label={action.title}
                icon={action.icon}
              />
            ))}
            {!primaryAction && secondaryActions.length === 0 ? (
              <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
                ไม่มีทางลัดตามสิทธิ์ปัจจุบัน
              </p>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title={TH.pages.recentActivity}
          description="เหตุการณ์ล่าสุดในขอบเขตที่คุณมีสิทธิ์"
        >
          <ActivityList
            items={recentAudits.map((row) => ({
              id: row.id,
              title: row.actionType.nameTh,
              meta: row.organization?.displayName ?? undefined,
              when: row.createdAt.toLocaleString("th-TH", {
                dateStyle: "short",
                timeStyle: "short",
              }),
            }))}
            empty={
              <EmptyState
                title={TH.common.empty}
                body="ยังไม่มีกิจกรรมในขอบเขตที่คุณมีสิทธิ์"
              />
            }
          />
        </SectionCard>
      </div>
    </PlatformShell>
  );
}
