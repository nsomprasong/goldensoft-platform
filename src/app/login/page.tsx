import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getAuthUser } from "@/lib/auth/session";
import { TH } from "@/lib/i18n/th";

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
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <section className="card">
        <p className="text-sm font-semibold text-[var(--accent)]">{TH.brand}</p>
        <h1 className="mt-1 text-2xl font-bold">{TH.login.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          ใช้บัญชีที่ยืนยันตัวตนผ่านระบบกลาง (Supabase Auth)
        </p>
        <LoginForm nextPath={nextPath} />
      </section>
    </div>
  );
}
