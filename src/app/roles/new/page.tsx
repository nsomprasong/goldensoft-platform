import { redirect } from "next/navigation";

import { requirePlatformPage } from "@/lib/auth/require-platform-page";

export const dynamic = "force-dynamic";

export default async function LegacyNewRolePage() {
  const ctx = await requirePlatformPage();
  if (!ctx.activeOrganization) redirect("/roles");
  redirect(`/roles?context=organization&organizationId=${ctx.activeOrganization.id}&scope=organization&action=new`);
}
