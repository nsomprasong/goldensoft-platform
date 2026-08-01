import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { BrandLockup } from "@/components/platform-shell";
import { LoginForm } from "@/components/login-form";
import { isGoldenSoftPlatformStaff } from "@/lib/auth/customer-app-redirect";
import { loadPlatformUserBundle } from "@/lib/auth/platform-user";
import {
  resolvePostLoginRedirect,
  resolveStaffPostLoginPath,
} from "@/lib/auth/post-login-redirect";
import { getAuthUser } from "@/lib/auth/session";
import { TH } from "@/lib/i18n/th";
import { alignCustomerAppOriginToRequestHost } from "@/lib/platform/customer-products";
import { isPhoneLoginEnabled } from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

function alignAbsoluteNext(
  nextPath: string,
  requestHost: string | null,
): string {
  if (nextPath.startsWith("/") || nextPath.startsWith("//")) return nextPath;
  try {
    const url = new URL(nextPath);
    const aligned = alignCustomerAppOriginToRequestHost(url.origin, requestHost);
    if (aligned === url.origin) return nextPath;
    return new URL(url.pathname + url.search, aligned).toString();
  } catch {
    return nextPath;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; password?: string }>;
}) {
  const user = await getAuthUser();
  const params = await searchParams;
  const headerStore = await headers();
  const requestHost =
    headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headerStore.get("host");
  const nextPath = alignAbsoluteNext(
    resolvePostLoginRedirect(params.next),
    requestHost,
  );
  const passwordJustSet = params.password === "set";

  if (user) {
    const bundle = await loadPlatformUserBundle(user.id);
    if (isGoldenSoftPlatformStaff(bundle.platformRoles)) {
      redirect(
        resolveStaffPostLoginPath(params.next ?? "/", {
          platformRoles: bundle.platformRoles,
          organizationRoles: bundle.memberships.flatMap((m) => m.roles),
        }),
      );
    }
    redirect(nextPath);
  }

  let phoneLoginEnabled = false;
  try {
    phoneLoginEnabled = await isPhoneLoginEnabled(prisma);
  } catch {
    phoneLoginEnabled = false;
  }

  return (
    <div className="auth-shell">
      <section className="auth-card">
        <BrandLockup subtitle={TH.shellName} />
        <h1 className="mt-5 text-[length:var(--text-page)] font-semibold leading-[var(--leading-tight)]">
          {TH.login.title}
        </h1>
        <p className="mt-2 text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          ใช้บัญชีที่ยืนยันตัวตนผ่านระบบกลาง — Customer App และ Platform Admin
          ใช้ Login นี้ชุดเดียว
          {phoneLoginEnabled
            ? " — รองรับทั้งอีเมลและเบอร์โทรศัพท์"
            : ""}
        </p>
        {passwordJustSet ? (
          <p
            className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[length:var(--text-helper)] text-[var(--success)]"
            role="status"
          >
            {TH.login.passwordSetSuccess}
          </p>
        ) : null}
        <LoginForm
          nextPath={nextPath}
          phoneLoginEnabled={phoneLoginEnabled}
        />
      </section>
    </div>
  );
}
