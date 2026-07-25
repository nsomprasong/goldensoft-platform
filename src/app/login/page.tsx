import { BrandLockup } from "@/components/platform-shell";
import { LoginForm } from "@/components/login-form";
import { getAuthUser } from "@/lib/auth/session";
import { TH } from "@/lib/i18n/th";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getAuthUser();
  if (user) {
    redirect("/");
  }

  const params = await searchParams;
  const nextPath =
    params.next && params.next.startsWith("/") ? params.next : "/";

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <BrandLockup subtitle={TH.shellName} />
        <h1 className="mt-5 text-[length:var(--text-page)] font-semibold leading-[var(--leading-tight)]">
          {TH.login.title}
        </h1>
        <p className="mt-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          ใช้บัญชีที่ยืนยันตัวตนผ่านระบบกลาง
        </p>
        <LoginForm nextPath={nextPath} />
      </section>
    </div>
  );
}
