import Link from "next/link";
import { CreditCard } from "lucide-react";
import { PlatformShell } from "@/components/platform-shell";
import { AccessDenied, PageHeader } from "@/components/ui/admin-ui";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { PLATFORM_PERMISSIONS, permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function BillingPage() {
  const ctx = await requirePlatformPage(); const actor = await loadActorAccess(prisma, ctx.user.id);
  const permissions = permissionsForRoles({ platformRoles: actor.platformRoles, organizationRoles: actor.organizationRoles });
  const shell = { displayName: ctx.bundle.profile?.displayName ?? "ผู้ใช้", platformRoles: ctx.bundle.platformRoles, organizationRoles: ctx.organizationRoles, organizations: ctx.bundle.memberships.map((m) => ({ id: m.organizationId, name: m.organizationName })), branches: ctx.branches, activeOrganization: ctx.activeOrganization, activeBranch: ctx.activeBranch };
  if (!permissions.includes(PLATFORM_PERMISSIONS.billingAccountRead)) return <PlatformShell {...shell}><AccessDenied title="ไม่มีสิทธิ์เข้าถึง" body="คุณไม่มีสิทธิ์ดูข้อมูลการเงิน" /></PlatformShell>;
  const organizations = await prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true, displayName: true, billingAccounts: { select: { id: true } } }, orderBy: { displayName: "asc" }, take: 200 });
  return <PlatformShell {...shell}><PageHeader title="การเงินและการเรียกเก็บเงิน" description="จัดการบัญชี เครดิต ใบแจ้งหนี้ การชำระเงิน และผู้ติดต่อ" icon={<CreditCard size={24} />} /><section className="card"><ul className="space-y-2">{organizations.map((org) => <li key={org.id}><Link className="block rounded p-3 hover:bg-slate-50" href={`/billing/${org.id}`}>{org.displayName} {org.billingAccounts.length ? "· มีบัญชีการเงิน" : "· ยังไม่มีบัญชีการเงิน"}</Link></li>)}</ul></section></PlatformShell>;
}
