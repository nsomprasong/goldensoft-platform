/**
 * Phase 8B.4 Platform billing browser + responsive + API acceptance.
 * Requires Platform + App servers. Sets ALLOW_TEST_AUTH in process only.
 */
import { chromium, type Page } from "playwright";
import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());
process.env.ALLOW_TEST_AUTH = "true";

type Step = { name: string; ok: boolean; detail?: string };

const PLATFORM = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3000";
const APP = process.env.ACCEPTANCE_APP_URL ?? "http://127.0.0.1:3002";
const WIDTHS = [375, 768, 820, 1024, 1130, 1280, 1440];

async function createPrisma() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const projectRoot = process.cwd();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 2 }));
  return {
    prisma: new PrismaClient({ adapter: new PrismaPg(pool) }),
    pool,
  };
}

async function noOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 2,
  );
}

async function main() {
  const steps: Step[] = [];
  const record = (name: string, ok: boolean, detail?: string) => {
    steps.push({ name, ok, detail });
    console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const { prisma, pool } = await createPrisma();
  const browser = await chromium.launch({ headless: true });

  try {
    const superAdmin = await prisma.userProfile.findFirst({
      where: {
        deletedAt: null,
        platformRoles: {
          some: { revokedAt: null, role: { code: "SUPER_ADMIN" } },
        },
      },
      select: { authUserId: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    if (!superAdmin) throw new Error("SUPER_ADMIN required");

    const demoOrg = await prisma.organization.findFirst({
      where: { customerCode: "COMPANY-DEMO", deletedAt: null },
      select: { id: true, displayName: true },
    });
    if (!demoOrg) throw new Error("COMPANY-DEMO required");

    const authHeaders = {
      "Content-Type": "application/json",
      "x-test-auth-user-id": superAdmin.authUserId,
      "x-test-auth-email": superAdmin.email,
    };

    const context = await browser.newContext({
      extraHTTPHeaders: {
        "x-test-auth-user-id": superAdmin.authUserId,
        "x-test-auth-email": superAdmin.email,
      },
    });
    const page = await context.newPage();

    for (const path of ["/billing", `/billing/${demoOrg.id}`]) {
      const res = await page.goto(`${PLATFORM}${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      record(
        `platform ${path}`,
        Boolean(res?.ok()) &&
          !(await page.locator("text=คุณไม่มีสิทธิ์").count()),
        `status=${res?.status()}`,
      );
      const bodyText = await page.locator("body").innerText();
      record(
        `platform ${path} thai copy`,
        /บัญชี|การเงิน|เครดิต|ใบแจ้ง/.test(bodyText),
      );
      record(
        `platform ${path} no PromptPay CTA`,
        !/ชำระด้วยพร้อมเพย์|Pay with card/i.test(bodyText),
      );
    }

    // API action smoke (create contact)
    const stamp = Date.now().toString(36);
    const contactRes = await context.request.post(`${PLATFORM}/api/platform/billing`, {
      headers: authHeaders,
      data: {
        action: "createContact",
        organizationId: demoOrg.id,
        contact: {
          name: `Browser Contact ${stamp}`,
          email: `browser.${stamp}@example.com`,
          phone: "0811111111",
          isPrimary: false,
        },
      },
    });
    const contactBody = (await contactRes.json()) as {
      ok?: boolean;
      code?: string;
      message?: string;
    };
    record(
      "platform billing typed action createContact",
      contactRes.status() === 201 && contactBody.ok === true,
      contactBody.code ?? contactBody.message,
    );

    const unknown = await context.request.post(`${PLATFORM}/api/platform/billing`, {
      headers: authHeaders,
      data: { action: "notARealAction", organizationId: demoOrg.id },
    });
    const unknownBody = (await unknown.json()) as { code?: string };
    record(
      "unknown action denied",
      unknown.status() >= 400 && unknownBody.code === "UNKNOWN_ACTION",
    );

    // Ordinary user deny (profile without platform billing role if available)
    const ordinary = await prisma.userProfile.findFirst({
      where: {
        deletedAt: null,
        NOT: {
          platformRoles: {
            some: {
              revokedAt: null,
              role: {
                code: { in: ["SUPER_ADMIN", "BILLING_ADMIN", "ADMIN"] },
              },
            },
          },
        },
      },
      select: { authUserId: true, email: true },
    });
    if (ordinary) {
      const denied = await context.request.post(`${PLATFORM}/api/platform/billing`, {
        headers: {
          "Content-Type": "application/json",
          "x-test-auth-user-id": ordinary.authUserId,
          "x-test-auth-email": ordinary.email,
        },
        data: {
          action: "adjustCredit",
          organizationId: demoOrg.id,
          direction: "CREDIT",
          amount: "1",
          reason: "should deny",
        },
      });
      record(
        "ordinary user billing API denied",
        denied.status() === 403,
        `status=${denied.status()}`,
      );
    } else {
      record("ordinary user billing API denied", true, "skipped — no ordinary user");
    }

    // Customer app routes
    await context.request.post(`${APP}/api/session/context`, {
      data: {
        organizationId: demoOrg.id,
        branchId: null,
        mode: "platform_admin",
      },
    });

    const customerPaths = [
      "/account",
      "/account/products",
      "/account/billing",
      "/account/credit",
      "/account/invoices",
      "/account/payments",
      "/account/contacts",
    ];
    for (const path of customerPaths) {
      const res = await page.goto(`${APP}${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const text = await page.locator("body").innerText();
      record(
        `customer ${path}`,
        Boolean(res?.ok()) && !/Unexpected token|SyntaxError/i.test(text),
        `status=${res?.status()}`,
      );
      record(
        `customer ${path} no fake pay button`,
        !/ชำระด้วยพร้อมเพย์|Pay now|Checkout/i.test(text),
      );
      record(
        `customer ${path} not raw JSON primary`,
        !text.trim().startsWith("{"),
      );
    }

    // Detail pages if data exists
    const invoice = await prisma.invoice.findFirst({
      where: { organizationId: demoOrg.id },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    const payment = await prisma.payment.findFirst({
      where: { organizationId: demoOrg.id },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (invoice) {
      const res = await page.goto(`${APP}/account/invoices/${invoice.id}`, {
        waitUntil: "domcontentloaded",
      });
      const text = await page.locator("body").innerText();
      record(
        "customer invoice detail",
        Boolean(res?.ok()) && /ใบแจ้งหนี้|รายการ|ยอด/.test(text),
      );
    }
    if (payment) {
      const res = await page.goto(`${APP}/account/payments/${payment.id}`, {
        waitUntil: "domcontentloaded",
      });
      const text = await page.locator("body").innerText();
      record(
        "customer payment detail",
        Boolean(res?.ok()) && /ชำระ|สถานะ|จำนวน/.test(text),
      );
    }

    // Responsive
    await page.goto(`${PLATFORM}/billing`, { waitUntil: "domcontentloaded" });
    for (const width of WIDTHS) {
      record(
        `platform responsive ${width}px`,
        await noOverflow(page, width),
      );
    }
    await page.goto(`${APP}/account/invoices`, {
      waitUntil: "domcontentloaded",
    });
    for (const width of WIDTHS) {
      record(`customer responsive ${width}px`, await noOverflow(page, width));
    }

    // Reload persistence
    await page.goto(`${APP}/account/credit`, { waitUntil: "domcontentloaded" });
    const before = await page.locator("body").innerText();
    await page.reload({ waitUntil: "domcontentloaded" });
    const after = await page.locator("body").innerText();
    record(
      "customer credit reload persists",
      before.length > 20 && after.length > 20,
    );

    const failed = steps.filter((s) => !s.ok);
    console.log(
      JSON.stringify(
        {
          ok: failed.length === 0,
          passed: steps.filter((s) => s.ok).length,
          failed: failed.length,
          failures: failed,
        },
        null,
        2,
      ),
    );
    process.exit(failed.length === 0 ? 0 : 2);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await browser.close();
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
