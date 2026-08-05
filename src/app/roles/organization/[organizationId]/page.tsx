import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ organizationId: string }> };

export default async function LegacyOrganizationRolesPage({ params }: Props) {
  const { organizationId } = await params;
  redirect(`/roles?context=organization&organizationId=${organizationId}`);
}
