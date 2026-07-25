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
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <section className="card">
        <p className="text-sm font-semibold text-[var(--accent)]">{TH.brand}</p>
        <h1 className="mt-2 text-xl font-bold">{title}</h1>
        <p className="mt-3 text-sm text-slate-600">{body}</p>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </section>
    </div>
  );
}
