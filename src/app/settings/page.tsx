import { Settings } from "lucide-react";

import { PlatformShell } from "@/components/platform-shell";
import { SystemSettingsToggles } from "@/components/system-settings-toggles";
import { DetailList, PageHeader, SectionHeader } from "@/components/ui/admin-ui";
import { AccessDenied } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { TH } from "@/lib/i18n/th";
import { getAuthFlexibilitySettings } from "@/lib/platform/system-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requirePlatformPage();
  const shellProps = {
    displayName: ctx.bundle.profile?.displayName ?? TH.common.user,
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
    pageTitle: TH.pages.settingsTitle,
  };

  if (!ctx.bundle.platformRoles.includes("SUPER_ADMIN")) {
    return (
      <PlatformShell {...shellProps}>
        <AccessDenied title={TH.access.deniedTitle} body={TH.access.deniedBody} />
      </PlatformShell>
    );
  }

  const inviteMode = process.env.AUTH_INVITE_MODE ?? "mock";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
  const redirectPath =
    process.env.SUPABASE_INVITE_REDIRECT_PATH ?? "/auth/accept-invite";
  let authSettings = {
    invitationsSendEnabled: true,
    phoneLoginEnabled: false,
  };
  try {
    authSettings = await getAuthFlexibilitySettings(prisma);
  } catch {
    // Table may not be migrated yet — show safe defaults.
  }

  return (
    <PlatformShell {...shellProps}>
      <PageHeader
        title={TH.pages.settingsTitle}
        description={TH.pages.settingsBody}
        icon={<Settings size={24} />}
      />

      <div className="grid gap-4">
        <section className="card">
          <SectionHeader
            title={TH.settings.authFlexibilityTitle}
            description={TH.settings.authFlexibilityBody}
          />
          <SystemSettingsToggles initial={authSettings} />
        </section>

        <section className="card">
          <SectionHeader title="ข้อมูลระบบ" />
          <DetailList
            items={[
              { label: "ชื่อระบบ", value: TH.shellName },
              { label: "รหัสแอป", value: process.env.APP_CODE ?? "PLATFORM" },
              {
                label: "สภาพแวดล้อม",
                value: process.env.NODE_ENV ?? "development",
              },
            ]}
          />
        </section>

        <section className="card">
          <SectionHeader title="ความปลอดภัย" />
          <DetailList
            items={[
              {
                label: "Test Auth",
                value: process.env.ALLOW_TEST_AUTH === "true" ? "เปิด" : "ปิด",
              },
              {
                label: "โครงการ Supabase",
                value: process.env.EXPECTED_SUPABASE_PROJECT_REF ?? "—",
              },
            ]}
          />
        </section>

        <section className="card">
          <SectionHeader
            title="การเชิญผู้ใช้งาน (ค่าแวดล้อม)"
            description="โหมด mock/real ตั้งจาก environment ของเซิร์ฟเวอร์ — แยกจากสวิตช์เปิด-ปิดด้านบน"
          />
          <DetailList
            items={[
              { label: "โหมดคำเชิญ", value: inviteMode },
              {
                label: "ส่งคำเชิญ (สวิตช์ระบบ)",
                value: authSettings.invitationsSendEnabled
                  ? TH.settings.statusOn
                  : TH.settings.statusOff,
              },
              { label: "URL แอป", value: appUrl },
              { label: "เส้นทางรับคำเชิญ", value: redirectPath },
            ]}
          />
          {inviteMode === "mock" ? (
            <p className="mt-3 text-[length:var(--text-helper)] text-[var(--text-muted)]">
              ขณะนี้อยู่ในโหมดทดสอบ — ยังไม่ส่งอีเมลจริง
            </p>
          ) : null}
        </section>

        <section className="card">
          <SectionHeader title="การเชื่อมต่อ" description="ค่าที่ระบบใช้งานอยู่ (อ่านอย่างเดียว)" />
          <DetailList
            items={[
              {
                label: "Supabase URL",
                value: process.env.NEXT_PUBLIC_SUPABASE_URL
                  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
                  : "—",
              },
              {
                label: "Secret key",
                value: process.env.SUPABASE_SECRET_KEY ? "ตั้งค่าแล้ว" : "ยังไม่ตั้งค่า",
              },
            ]}
          />
        </section>

        <section className="card">
          <SectionHeader title="ค่าเริ่มต้นผลิตภัณฑ์ / การสมัคร" />
          <DetailList
            items={[
              {
                label: "โหมด seed",
                value: process.env.SEED_MODE ?? "system (ค่าเริ่มต้น)",
              },
              {
                label: "ราคาแพ็กเกจ",
                value: "ข้อมูลตัวอย่าง — แก้ได้จากหน้าแพ็กเกจหลัง migration",
              },
            ]}
          />
        </section>

        <section className="card">
          <SectionHeader title="ข้อมูลเวอร์ชัน" />
          <DetailList
            items={[
              { label: "แพลตฟอร์ม", value: "GoldenSoft Platform" },
              { label: "เฟส", value: "Phase 7 Complete Platform Operations" },
            ]}
          />
        </section>
      </div>
    </PlatformShell>
  );
}
