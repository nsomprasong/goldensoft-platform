import Link from "next/link";
import type { ReactNode } from "react";

import { PlatformShell } from "@/components/platform-shell";
import {
  ActivityList,
  EmptyState,
  SectionHeader,
  StatCard,
} from "@/components/ui/admin-ui";
import {
  IconAudit,
  IconBranch,
  IconDashboard,
  IconMail,
  IconOrganization,
  IconPlus,
  IconSubscription,
  IconUsers,
} from "@/components/ui/icons";
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
  const canCreateOrg = isSuper;
  const canInvite = perms.includes(PLATFORM_PERMISSIONS.userInvite);
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
  };

  const primaryAction = canInvite
    ? {
        href: "/users/invite",
        title: TH.users.invite,
        body: "ส่งคำเชิญและกำหนดบทบาทให้ผู้ใช้ใหม่",
        icon: <IconUsers size={20} />,
      }
    : canCreateOrg
      ? {
          href: "/organizations/new",
          title: TH.org.add,
          body: "สร้างองค์กรใหม่บนแพลตฟอร์ม",
          icon: <IconOrganization size={20} />,
        }
      : null;

  const secondaryActions = [
    canCreateOrg && primaryAction?.href !== "/organizations/new"
      ? {
          href: "/organizations/new",
          title: TH.org.add,
          body: "สร้างองค์กรใหม่บนแพลตฟอร์ม",
          icon: <IconPlus size={18} />,
        }
      : null,
    canCreateBranch && ctx.activeOrganization
      ? {
          href: `/organizations/${ctx.activeOrganization.id}/branches/new`,
          title: TH.branch.add,
          body: "เพิ่มสาขาในองค์กรที่ใช้งานอยู่",
          icon: <IconBranch size={18} />,
        }
      : null,
    canInvite && primaryAction?.href !== "/users/invite"
      ? {
          href: "/users/invite",
          title: TH.users.invite,
          body: "ส่งคำเชิญและกำหนดบทบาท",
          icon: <IconUsers size={18} />,
        }
      : null,
    canReadAudit
      ? {
          href: "/audit-logs",
          title: TH.nav.auditLogs,
          body: "ติดตามเหตุการณ์สำคัญล่าสุด",
          icon: <IconAudit size={18} />,
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
      <section className="dashboard-hero mb-5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--shadow-sm)]">
        <div className="dashboard-hero-surface relative px-4 py-5 sm:px-6 sm:py-6">
          <div
            className="dashboard-hero-orb pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full"
            aria-hidden="true"
          />
          <div
            className="dashboard-hero-accent pointer-events-none absolute bottom-0 left-0 h-1 w-full"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]"
              aria-hidden="true"
            >
              <IconDashboard size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[length:var(--text-caption)] font-semibold uppercase tracking-wide text-[var(--primary)]">
                {TH.shellName}
              </p>
              <h1 className="mt-1 text-[length:var(--text-page)] font-semibold leading-[var(--leading-tight)] text-[var(--text-primary)]">
                {greetingForHour(hour)} {displayName}
              </h1>
              <p className="mt-1 max-w-2xl text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                {TH.pages.dashboardBody}
              </p>
              <p className="mt-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {TH.common.currentOrganization}:{" "}
                <strong className="text-[var(--text-secondary)]">
                  {ctx.activeOrganization?.name ?? TH.common.notFound}
                </strong>
                {" · "}
                {TH.common.currentBranch}:{" "}
                <strong className="text-[var(--text-secondary)]">
                  {ctx.activeBranch?.name ?? TH.common.noBranch}
                </strong>
              </p>
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
              icon={<IconOrganization size={22} />}
            />
          ) : null}
          {perms.includes(PLATFORM_PERMISSIONS.branchRead) ? (
            <StatCard
              label={TH.nav.branches}
              value={branchCount}
              hint="สาขาที่มองเห็นได้"
              href="/branches"
              accent="green"
              icon={<IconBranch size={22} />}
            />
          ) : null}
          {perms.includes(PLATFORM_PERMISSIONS.userRead) ? (
            <StatCard
              label={TH.nav.users}
              value={userCount}
              hint="สมาชิกองค์กรที่ยังใช้งาน"
              href="/users"
              accent="violet"
              icon={<IconUsers size={22} />}
            />
          ) : null}
          {perms.includes(PLATFORM_PERMISSIONS.subscriptionRead) ? (
            <StatCard
              label={TH.pages.activeSubscriptions}
              value={activeSubscriptionCount}
              hint="สถานะใช้งาน / ทดลอง / ค้างชำระ"
              href="/subscriptions"
              accent="amber"
              icon={<IconSubscription size={22} />}
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
              icon={<IconMail size={22} />}
            />
          </div>
        ) : null}
      </section>

      <div className="dashboard-panels mt-5">
        <section className="card">
          <SectionHeader
            title={TH.pages.quickActions}
            description="ทางลัดตามสิทธิ์ปัจจุบันของคุณ"
          />
          <div className="grid gap-2">
            {primaryAction ? (
              <Link
                href={primaryAction.href}
                className="dashboard-primary-action flex items-start gap-3 rounded-[var(--radius-lg)] border p-3.5 transition hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--primary)]">
                  {primaryAction.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)]">
                    {primaryAction.title}
                  </span>
                  <span className="mt-0.5 block text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                    {primaryAction.body}
                  </span>
                </span>
              </Link>
            ) : null}
            {secondaryActions.map((action) => (
              <Link
                key={action.href + action.title}
                href={action.href}
                className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-muted)] text-[var(--text-secondary)]">
                  {action.icon}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)]">
                    {action.title}
                  </span>
                  <span className="mt-0.5 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {action.body}
                  </span>
                </span>
              </Link>
            ))}
            {!primaryAction && secondaryActions.length === 0 ? (
              <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
                ไม่มีทางลัดตามสิทธิ์ปัจจุบัน
              </p>
            ) : null}
          </div>
        </section>

        <section className="card">
          <SectionHeader
            title={TH.pages.recentActivity}
            description="เหตุการณ์ล่าสุดในขอบเขตที่คุณมีสิทธิ์"
          />
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
        </section>
      </div>
    </PlatformShell>
  );
}
