import { PlatformShell } from "@/components/platform-shell";
import { PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { getBillingSummary } from "@/lib/billing/summary";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function OrganizationBillingPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const ctx = await requirePlatformPage(); const organizationId = (await params).organizationId; const actor = await loadActorAccess(prisma, ctx.user.id);
  const permissions = permissionsForRoles({ platformRoles: actor.platformRoles, organizationRoles: actor.organizationRoles });
  const summary = await getBillingSummary(prisma, organizationId, permissions);
  const shell = { displayName: ctx.bundle.profile?.displayName ?? "ผู้ใช้", platformRoles: ctx.bundle.platformRoles, organizationRoles: ctx.organizationRoles, organizations: ctx.bundle.memberships.map((m) => ({ id: m.organizationId, name: m.organizationName })), branches: ctx.branches, activeOrganization: ctx.activeOrganization, activeBranch: ctx.activeBranch };
  return <PlatformShell {...shell}><PageHeader title="บัญชีการเงินองค์กร" description="การสร้างบัญชี ปรับเครดิต และจัดการเอกสารการเงินใช้ Platform API ที่ตรวจสิทธิ์ทุกคำสั่ง" /><section className="card"><pre className="overflow-auto text-sm">{JSON.stringify(summary, null, 2)}</pre></section></PlatformShell>;
}
