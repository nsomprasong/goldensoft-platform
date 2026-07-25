import { BrandLockup } from "@/components/platform-shell";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { TH } from "@/lib/i18n/th";

export default function AcceptInvitePage() {
  return (
    <div className="auth-shell">
      <section className="auth-card">
        <BrandLockup subtitle={TH.shellName} />
        <h1 className="mt-5 text-[length:var(--text-page)] font-semibold leading-[var(--leading-tight)]">
          ยอมรับคำเชิญเข้าใช้งาน GoldenSoft
        </h1>
        <p className="mt-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          ตั้งรหัสผ่านเพื่อเปิดใช้งานบัญชีของคุณ
        </p>
        <div className="mt-6">
          <AcceptInviteForm />
        </div>
      </section>
    </div>
  );
}
