import { redirect } from "next/navigation";

import { requirePlatformPage } from "@/lib/auth/require-platform-page";

export const dynamic = "force-dynamic";

export default async function LegacyPlatformRolesPage() {
  const ctx = await requirePlatformPage();
  const organizationId = ctx.activeOrganization?.id;
  redirect(organizationId ? `/roles?context=platform&organizationId=${organizationId}` : "/roles");
}
