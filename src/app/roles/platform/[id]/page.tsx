import { redirect } from "next/navigation";

import { requirePlatformPage } from "@/lib/auth/require-platform-page";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function LegacyPlatformRoleDetailPage({ params }: Props) {
  const ctx = await requirePlatformPage();
  const { id } = await params;
  const organizationId = ctx.activeOrganization?.id;
  redirect(organizationId ? `/roles?context=platform&organizationId=${organizationId}&scope=platform&roleId=${id}` : "/roles");
}
