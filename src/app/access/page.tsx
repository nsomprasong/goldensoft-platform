import { BrandLockup } from "@/components/platform-shell";
import { LogoutButton } from "@/components/logout-button";
import { TH } from "@/lib/i18n/th";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  let title: string = TH.access.forbidden;
  let body: string = TH.access.noMembershipBody;

  if (reason === "no_profile") {
    title = TH.access.noProfileTitle;
    body = TH.access.noProfileBody;
  } else if (reason === "suspended") {
    title = TH.access.suspendedTitle;
    body = TH.access.suspendedBody;
  } else if (reason === "no_membership") {
    title = TH.access.noMembershipTitle;
    body = TH.access.noMembershipBody;
  } else if (reason === "customer_app") {
    title = TH.access.customerAppTitle;
    body = TH.access.customerAppBody;
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <BrandLockup subtitle={TH.shellName} />
        <h1 className="mt-5 text-[length:var(--text-page)] font-semibold">{title}</h1>
        <p className="mt-3 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          {body}
        </p>
        <div className="mt-6">
          <LogoutButton appearance="text" />
        </div>
      </section>
    </div>
  );
}
