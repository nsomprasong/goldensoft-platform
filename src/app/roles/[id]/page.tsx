import { redirect } from "next/navigation";

import { requirePlatformPage } from "@/lib/auth/require-platform-page";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function LegacyOrganizationRoleDetailPage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  if (!ctx.activeOrganization) redirect("/roles");
  redirect(`/roles?context=organization&organizationId=${ctx.activeOrganization.id}&scope=organization&roleId=${id}`);
}
