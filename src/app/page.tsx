import Link from "next/link";

import { PlatformShell } from "@/components/platform-shell";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { TH } from "@/lib/i18n/th";

export default async function DashboardPage() {
  const ctx = await requirePlatformPage();

  return (
    <PlatformShell
      displayName={ctx.bundle.profile?.displayName ?? TH.common.user}
      platformRoles={ctx.bundle.platformRoles}
      organizationRoles={ctx.organizationRoles}
      organizations={ctx.bundle.memberships.map((m) => ({
        id: m.organizationId,
        name: m.organizationName,
      }))}
      branches={ctx.branches}
      activeOrganization={ctx.activeOrganization}
      activeBranch={ctx.activeBranch}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card md:col-span-2">
          <h2 className="text-xl font-semibold">{TH.pages.dashboardTitle}</h2>
          <p className="mt-2 text-sm text-slate-600">{TH.pages.dashboardBody}</p>
        </section>
        {[
          {
            href: "/organizations",
            title: TH.nav.organizations,
            body: "จัดการองค์กรลูกค้าและสถานะการใช้งาน",
          },
          {
            href: "/products",
            title: TH.nav.products,
            body: "ผลิตภัณฑ์ RESIDENT / HR / QRSTATION",
          },
          {
            href: "/plans",
            title: TH.nav.plans,
            body: "แพ็กเกจและเวอร์ชันราคา",
          },
          {
            href: "/subscriptions",
            title: TH.nav.subscriptions,
            body: "สิทธิ์การใช้งานและสถานะการสมัคร",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="card transition hover:shadow-md"
          >
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{item.body}</p>
          </Link>
        ))}
      </div>
    </PlatformShell>
  );
}
