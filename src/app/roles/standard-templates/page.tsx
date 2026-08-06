import Link from "next/link";
import { LibraryBig, Pencil } from "lucide-react";

import { CustomRoleForm } from "@/components/custom-role-form";
import { PlatformShell } from "@/components/platform-shell";
import { RoleManagementSubmenu } from "@/components/role-management-submenu";
import { AccessDenied, PageHeader, SectionHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { loadPermissionRegistry } from "@/lib/permissions/registry";
import { isGoldenSoftCustomerCode } from "@/lib/platform/bootstrap-organization";
import { MASTER } from "@/lib/platform/master-codes";
import { prisma } from "@/lib/prisma";

import styles from "../roles.module.css";

export const dynamic = "force-dynamic";

export default async function StandardRoleTemplatesPage({ searchParams }: { searchParams: Promise<{ roleId?: string }> }) {
  const ctx = await requirePlatformPage();
  const query = await searchParams;
  const organizationId = ctx.activeOrganization?.id ?? null;
  const platformContext = ctx.contextMode === "platform_admin" && isGoldenSoftCustomerCode(ctx.activeOrganization?.customerCode);
  const isSuperAdmin = ctx.bundle.platformRoles.includes(MASTER.platformRole.SUPER_ADMIN);
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    contextMode: ctx.contextMode,
    canUseManagedOrgMode: ctx.managedOrganizationIds.length > 0,
  };
  if (!organizationId || !platformContext || !isSuperAdmin) {
    return <PlatformShell {...shellProps}><AccessDenied title={TH.access.deniedTitle} body="เฉพาะ Super Admin เท่านั้นที่จัดการแม่แบบบทบาทมาตรฐานได้" /></PlatformShell>;
  }

  const [roles, permissions] = await Promise.all([
    prisma.organizationRole.findMany({
      where: { organizationId: null, isSystem: true },
      include: { permissions: { where: { revokedAt: null, permission: { is: { isActive: true } } }, include: { permission: true } } },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    }),
    loadPermissionRegistry(prisma, { allOrganizationProducts: true }),
  ]);
  const selected = roles.find((role) => role.id === query.roleId) ?? null;

  return (
    <PlatformShell {...shellProps}>
      <PageHeader title="แม่แบบบทบาทมาตรฐาน" description="แก้ต้นฉบับที่ใช้กับทุกองค์กร องค์กรที่มีค่าปรับเฉพาะจะยังคงค่าของตนจนกว่าจะคืนค่าเริ่มต้น" icon={<LibraryBig size={24} />} />
      <div className="grid items-start gap-4 pb-24 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <aside className="card grid gap-3 xl:sticky xl:top-[calc(var(--header-height)+1rem)]">
          <SectionHeader title="บทบาทมาตรฐานส่วนกลาง" description="เลือกบทบาทเพื่อแก้ชื่อ คำอธิบาย และสิทธิ์ตั้งต้น" />
          <ul className="grid gap-2">
            {roles.map((role) => (
              <li key={role.id}>
                <div className={`${styles.roleCard} ${selected?.id === role.id ? styles.roleCardSelected : ""}`}>
                  <span className="min-w-0"><span className="block truncate font-semibold">{role.nameTh}</span><span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">สิทธิ์ {role.permissions.length} รายการ</span></span>
                  <Link href={`/roles/standard-templates?roleId=${role.id}#template-editor`} className="nav-icon-idle-organization inline-flex size-10 shrink-0 items-center justify-center rounded-full" aria-label={`แก้แม่แบบ ${role.nameTh}`}><Pencil className="size-4" /></Link>
                </div>
              </li>
            ))}
          </ul>
        </aside>
        <main id="template-editor" className="min-w-0 scroll-mt-24">
          {selected ? (
            <CustomRoleForm
              key={selected.id}
              mode="edit"
              roleKind="organization-template"
              roleId={selected.id}
              organizationId={null}
              allowSystemPermissionEdit
              permissionCatalog={permissions}
              returnPath="/roles/standard-templates"
              initial={{ code: selected.code, nameTh: selected.nameTh, nameEn: selected.nameEn, description: selected.description ?? "", permissionCodes: selected.permissions.map((item) => item.permission.code), isSystem: true, isActive: selected.isActive }}
            />
          ) : <section className="card grid min-h-40 place-content-center text-center"><h2 className="font-semibold">เลือกแม่แบบบทบาทเพื่อแก้ไข</h2></section>}
        </main>
      </div>
      <RoleManagementSubmenu active="standard-templates" organizationId={organizationId} platformContext />
    </PlatformShell>
  );
}
