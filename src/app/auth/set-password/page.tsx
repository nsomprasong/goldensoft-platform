import { BrandLockup } from "@/components/platform-shell";
import { SetPasswordGate } from "@/components/set-password-gate";
import { loadPasswordResetFromSession } from "@/lib/auth/password-reset-session";
import { TH } from "@/lib/i18n/th";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const reset = await loadPasswordResetFromSession();

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <BrandLockup subtitle={TH.shellName} />
        <h1 className="mt-5 text-[length:var(--text-page)] font-semibold leading-[var(--leading-tight)]">
          {TH.setPassword.title}
        </h1>
        <SetPasswordGate
          initialReset={
            reset
              ? {
                  email: reset.email,
                  expiresAtIso: reset.expiresAt.toISOString(),
                }
              : null
          }
        />
      </section>
    </div>
  );
}
