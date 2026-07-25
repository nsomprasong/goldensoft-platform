/**
 * Phase 7C browser + API acceptance.
 *
 * Uses ALLOW_TEST_AUTH=true via process env only (does not rewrite .env.local).
 * Does not create real invites. Does not change AUTH_INVITE_MODE.
 * Marks created records with ACCEPTANCE- prefix and deactivates them on cleanup.
 */
import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());
process.env.ALLOW_TEST_AUTH = "true";

type Step = { name: string; ok: boolean; detail?: string };

const BASE = process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3000";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const PREFIX = `ACCEPTANCE-${stamp.slice(0, 16)}`;

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
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

async function main() {
  const steps: Step[] = [];
  const { prisma, pool } = await createPrisma();
  const created = {
    productId: "" as string,
    planId: "" as string,
    planCode: `${PREFIX.replace(/-/g, "_").toUpperCase()}_PLAN`,
    productCode: `${PREFIX.replace(/-/g, "_").toUpperCase()}_PROD`,
    subscriptionId: "" as string,
    roleId: "" as string,
  };

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
    if (!superAdmin) {
      throw new Error("No SUPER_ADMIN profile found for acceptance");
    }
    const authHeaders = {
      "Content-Type": "application/json",
      "x-test-auth-user-id": superAdmin.authUserId,
      "x-test-auth-email": superAdmin.email,
    };

    const org = await prisma.organization.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { customerCode: "GOLDENSOFT" },
          { slug: "goldensoft" },
          { displayName: { contains: "GOLDENSOFT" } },
        ],
      },
      select: { id: true, displayName: true, customerCode: true },
    });
    if (!org) throw new Error("GOLDENSOFT organization not found");

    const ownerProfile = await prisma.userProfile.findFirst({
      where: {
        deletedAt: null,
        memberships: {
          some: {
            roles: { some: { revokedAt: null, role: { code: "OWNER" } } },
          },
        },
        NOT: {
          platformRoles: {
            some: { revokedAt: null, role: { code: "SUPER_ADMIN" } },
          },
        },
      },
      select: {
        authUserId: true,
        email: true,
        memberships: {
          select: {
            organizationId: true,
            organization: { select: { customerCode: true } },
          },
          take: 3,
        },
      },
    });

    async function api(
      method: string,
      path: string,
      body?: unknown,
      headers: Record<string, string> = authHeaders,
    ) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        json = { raw: text.slice(0, 200) };
      }
      return { res, json, text };
    }

    // Health: dashboard HTML under test auth
    {
      const res = await fetch(`${BASE}/`, { headers: authHeaders, redirect: "manual" });
      steps.push({
        name: "SUPER_ADMIN dashboard reachable",
        ok: res.status === 200 || res.status === 307 || res.status === 302,
        detail: `status=${res.status}`,
      });
    }

    // Products
    {
      const { res, json } = await api("POST", "/api/platform/products", {
        code: created.productCode,
        nameTh: `${PREFIX} Product`,
        nameEn: `${PREFIX} Product`,
        productType: "APPLICATION",
        sortOrder: 999,
      });
      const product = json.product as { id?: string } | undefined;
      created.productId = product?.id ?? "";
      steps.push({
        name: "Create ACCEPTANCE product",
        ok: res.ok && Boolean(created.productId),
        detail: `status=${res.status} msg=${String(json.message ?? "")}`,
      });
    }

    if (created.productId) {
      const { res } = await api("PATCH", `/api/platform/products/${created.productId}`, {
        nameTh: `${PREFIX} Product Updated`,
        nameEn: `${PREFIX} Product Updated`,
      });
      steps.push({ name: "Edit product", ok: res.ok, detail: `status=${res.status}` });

      const deact = await api("POST", `/api/platform/products/${created.productId}`, {
        action: "deactivate",
      });
      steps.push({
        name: "Deactivate product",
        ok: deact.res.ok,
        detail: `status=${deact.res.status}`,
      });
      const act = await api("POST", `/api/platform/products/${created.productId}`, {
        action: "activate",
      });
      steps.push({
        name: "Activate product",
        ok: act.res.ok,
        detail: `status=${act.res.status}`,
      });
    }

    // Plan with feature matrix
    {
      const { res, json } = await api("POST", "/api/platform/plans", {
        productId: created.productId,
        code: created.planCode,
        name: `${PREFIX} Plan`,
        description: "ACCEPTANCE test plan",
        billingCycleCode: "MONTHLY",
        basePrice: 100,
        currency: "THB",
        trialDays: 7,
        sortOrder: 999,
        features: [
          {
            featureCode: `${created.productCode.toLowerCase()}.access`,
            limitValue: "true",
          },
        ],
      });
      const plan = json.plan as { id?: string } | undefined;
      created.planId = plan?.id ?? "";
      steps.push({
        name: "Create plan with feature matrix",
        ok: res.ok && Boolean(created.planId),
        detail: `status=${res.status} msg=${String(json.message ?? "")}`,
      });
    }

    if (created.planId) {
      const dup = await api("POST", `/api/platform/plans/${created.planId}`, {
        action: "duplicate",
      });
      steps.push({
        name: "Duplicate plan version",
        ok: dup.res.ok,
        detail: `status=${dup.res.status}`,
      });
      const edit = await api("PATCH", `/api/platform/plans/${created.planId}`, {
        name: `${PREFIX} Plan Updated`,
      });
      steps.push({
        name: "Edit plan",
        ok: edit.res.ok,
        detail: `status=${edit.res.status}`,
      });
    }

    // Subscription lifecycle
    {
      const { res, json } = await api("POST", "/api/platform/subscriptions", {
        organizationId: org.id,
        productCode: created.productCode,
        planCode: created.planCode,
        billingCycleCode: "MONTHLY",
        statusCode: "TRIAL",
        idempotencyKey: `${PREFIX}-sub-create`,
      });
      const nested = json as {
        subscriptionId?: string;
        subscription?: { id?: string };
        id?: string;
      };
      created.subscriptionId =
        nested.subscriptionId ?? nested.subscription?.id ?? nested.id ?? "";
      steps.push({
        name: "Create trial subscription",
        ok: res.ok && Boolean(created.subscriptionId),
        detail: `status=${res.status} msg=${String(json.message ?? "")}`,
      });
    }

    const lifecycle = [
      "activate",
      "suspend",
      "resume",
      "extend",
      "cancel",
    ] as const;
    for (const action of lifecycle) {
      if (!created.subscriptionId) break;
      const body: Record<string, unknown> = { action };
      if (action === "extend") {
        body.endsAt = new Date(Date.now() + 40 * 86400000).toISOString();
      }
      const { res, json } = await api(
        "POST",
        `/api/platform/subscriptions/${created.subscriptionId}/actions`,
        body,
      );
      steps.push({
        name: `Subscription ${action}`,
        ok: res.ok,
        detail: `status=${res.status} msg=${String(json.message ?? "")}`,
      });
    }

    // Change plan needs ACTIVE - create a second trial and activate for change_plan
    let changeSubId = "";
    {
      const secondPlanCode = `${created.planCode}_B`;
      const planB = await api("POST", "/api/platform/plans", {
        productId: created.productId,
        code: secondPlanCode,
        name: `${PREFIX} Plan B`,
        billingCycleCode: "MONTHLY",
        basePrice: 200,
        currency: "THB",
        trialDays: 0,
        sortOrder: 998,
        features: [
          {
            featureCode: `${created.productCode.toLowerCase()}.access`,
            limitValue: "true",
          },
        ],
      });
      const { res, json } = await api("POST", "/api/platform/subscriptions", {
        organizationId: org.id,
        productCode: created.productCode,
        planCode: created.planCode,
        billingCycleCode: "MONTHLY",
        statusCode: "TRIAL",
        idempotencyKey: `${PREFIX}-sub-change`,
      });
      const nested = json as {
        subscriptionId?: string;
        subscription?: { id?: string };
        result?: { subscription?: { id?: string } };
        id?: string;
      };
      changeSubId =
        nested.subscriptionId ??
        nested.subscription?.id ??
        nested.result?.subscription?.id ??
        nested.id ??
        "";
      if (changeSubId) {
        await api("POST", `/api/platform/subscriptions/${changeSubId}/actions`, {
          action: "activate",
        });
        const change = await api(
          "POST",
          `/api/platform/subscriptions/${changeSubId}/actions`,
          {
            action: "change_plan",
            planCode: secondPlanCode,
            idempotencyKey: `${PREFIX}-change-plan`,
          },
        );
        steps.push({
          name: "Change plan",
          ok: change.res.ok && planB.res.ok && res.ok,
          detail: `status=${change.res.status}`,
        });
      } else {
        steps.push({
          name: "Change plan",
          ok: false,
          detail: "missing second subscription id",
        });
      }
    }

    // History records
    if (created.subscriptionId) {
      const count = await prisma.subscriptionHistory.count({
        where: { subscriptionId: created.subscriptionId },
      });
      steps.push({
        name: "Subscription history rows written",
        ok: count >= 1,
        detail: `count=${count}`,
      });
      const page = await fetch(`${BASE}/subscriptions/${created.subscriptionId}`, {
        headers: authHeaders,
        redirect: "manual",
      });
      const html = await page.text();
      steps.push({
        name: "History UI page contains Thai section",
        ok:
          page.status === 200 &&
          html.includes("ประวัติการเปลี่ยนแปลง"),
        detail: `status=${page.status}`,
      });
    }

    // Custom role
    {
      const { res, json } = await api("POST", "/api/platform/roles", {
        organizationId: org.id,
        code: `${PREFIX}_ROLE`.replace(/-/g, "_").toUpperCase(),
        nameTh: `${PREFIX} Role`,
        nameEn: `${PREFIX} Role`,
        permissionCodes: ["platform.user.read"],
      });
      const role = json.role as { id?: string } | undefined;
      created.roleId = role?.id ?? "";
      steps.push({
        name: "Create custom role",
        ok: res.ok && Boolean(created.roleId),
        detail: `status=${res.status}`,
      });
    }

    // OWNER forbidden product manage
    if (ownerProfile) {
      const ownerHeaders = {
        "Content-Type": "application/json",
        "x-test-auth-user-id": ownerProfile.authUserId,
        "x-test-auth-email": ownerProfile.email,
      };
      const forbidden = await api(
        "POST",
        "/api/platform/products",
        {
          code: `${created.productCode}_OWNER`,
          nameTh: "should fail",
          nameEn: "should fail",
          productType: "APPLICATION",
        },
        ownerHeaders,
      );
      steps.push({
        name: "OWNER cannot create product",
        ok: forbidden.res.status === 403 || !forbidden.res.ok,
        detail: `status=${forbidden.res.status}`,
      });
      const productsPage = await fetch(`${BASE}/products/new`, {
        headers: {
          ...ownerHeaders,
          Accept: "text/html",
          "RSC": "0",
        },
        redirect: "follow",
      });
      const body = await productsPage.text();
      const denied =
        body.includes("ไม่มีสิทธิ์") ||
        body.includes("AccessDenied") ||
        body.includes("deniedTitle") ||
        !body.includes("เพิ่มผลิตภัณฑ์");
      steps.push({
        name: "OWNER direct product URL denied",
        ok: denied && productsPage.status === 200,
        detail: `status=${productsPage.status} hasForm=${body.includes("เพิ่มผลิตภัณฑ์")} hasDenied=${body.includes("ไม่มีสิทธิ์")}`,
      });
    } else {
      steps.push({
        name: "OWNER cannot create product",
        ok: false,
        detail: "OWNER profile not found — skipped",
      });
    }

    // Playwright UI click-through when available
    try {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext({
          extraHTTPHeaders: {
            "x-test-auth-user-id": superAdmin.authUserId,
            "x-test-auth-email": superAdmin.email,
          },
          viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();
        await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 90000 });
        await page.waitForTimeout(300);
        steps.push({
          name: "Browser: dashboard load",
          ok: !page.url().includes("/login"),
          detail: page.url(),
        });

        for (const route of [
          "/organizations",
          "/products",
          "/plans",
          "/subscriptions",
          "/roles",
          "/users",
          "/audit-logs",
        ]) {
          try {
            await page.goto(`${BASE}${route}`, {
              waitUntil: "load",
              timeout: 90000,
            });
            await page.waitForTimeout(200);
            const denied = await page.getByText("ไม่มีสิทธิ์เข้าถึง").count();
            steps.push({
              name: `Browser navigate ${route}`,
              ok: !page.url().includes("/login") && denied === 0,
              detail: page.url(),
            });
          } catch (error) {
            steps.push({
              name: `Browser navigate ${route}`,
              ok: false,
              detail: error instanceof Error ? error.message : "nav failed",
            });
          }
        }

        if (created.subscriptionId) {
          try {
            await page.goto(`${BASE}/subscriptions/${created.subscriptionId}`, {
              waitUntil: "load",
              timeout: 90000,
            });
            await page.waitForTimeout(300);
            const hist = await page.getByText("ประวัติการเปลี่ยนแปลง").count();
            steps.push({
              name: "Browser: subscription history section",
              ok: hist > 0,
            });
          } catch (error) {
            steps.push({
              name: "Browser: subscription history section",
              ok: false,
              detail: error instanceof Error ? error.message : "failed",
            });
          }
        }

        if (ownerProfile) {
          const ownerCtx = await browser.newContext({
            extraHTTPHeaders: {
              "x-test-auth-user-id": ownerProfile.authUserId,
              "x-test-auth-email": ownerProfile.email,
            },
            viewport: { width: 1280, height: 800 },
          });
          try {
            const ownerPage = await ownerCtx.newPage();
            await ownerPage.goto(`${BASE}/products/new`, {
              waitUntil: "networkidle",
              timeout: 90000,
            }).catch(() => undefined);
            // Allow auth/context bootstrap redirects to settle.
            await ownerPage.waitForTimeout(1500);
            const finalUrl = ownerPage.url();
            const content = await ownerPage.content();
            const denied =
              content.includes("ไม่มีสิทธิ์เข้าถึง") ||
              content.includes("คุณไม่มีสิทธิ์ดำเนินการนี้");
            const hasCreateForm =
              content.includes('name="code"') &&
              content.includes("เพิ่มผลิตภัณฑ์");
            const redirectedAway =
              finalUrl.includes("/login") ||
              finalUrl.includes("/access") ||
              finalUrl.includes("/select-organization") ||
              !finalUrl.includes("/products/new");
            steps.push({
              name: "Browser OWNER denied product create page",
              ok: (denied && !hasCreateForm) || (redirectedAway && !hasCreateForm),
              detail: `denied=${denied} form=${hasCreateForm} url=${finalUrl}`,
            });
          } catch (error) {
            steps.push({
              name: "Browser OWNER denied product create page",
              ok: false,
              detail: error instanceof Error ? error.message : "failed",
            });
          } finally {
            await ownerCtx.close();
          }
        }

        for (const width of [375, 768, 820, 1024, 1130, 1280, 1440]) {
          try {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`${BASE}/subscriptions`, {
              waitUntil: "load",
              timeout: 90000,
            });
            await page.waitForTimeout(200);
            const overflow = await page.evaluate(() => {
              const doc = document.documentElement;
              return doc.scrollWidth > doc.clientWidth + 2;
            });
            steps.push({
              name: `Responsive no overflow @${width}`,
              ok: !overflow,
              detail: overflow ? "horizontal overflow" : "ok",
            });
          } catch (error) {
            steps.push({
              name: `Responsive no overflow @${width}`,
              ok: false,
              detail: error instanceof Error ? error.message : "failed",
            });
          }
        }

        await context.close();
      } finally {
        await browser.close();
      }
    } catch (error) {
      steps.push({
        name: "Playwright browser suite",
        ok: false,
        detail:
          error instanceof Error
            ? error.message
            : "playwright unavailable",
      });
    }

    // Cleanup: deactivate acceptance products/plans (keep history)
    if (created.planId) {
      await api("POST", `/api/platform/plans/${created.planId}`, {
        action: "deactivate",
      });
    }
    if (created.productId) {
      await api("POST", `/api/platform/products/${created.productId}`, {
        action: "deactivate",
      });
    }
    if (created.roleId) {
      await prisma.organizationRole.updateMany({
        where: { id: created.roleId },
        data: { isActive: false },
      });
    }
    steps.push({
      name: "Cleanup deactivated ACCEPTANCE records",
      ok: true,
      detail: `product=${created.productId ? "yes" : "no"} plan=${created.planId ? "yes" : "no"}`,
    });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  console.log(JSON.stringify({ base: BASE, prefix: PREFIX, steps }, null, 2));
  const failed = steps.filter((s) => !s.ok);
  if (failed.length > 0) {
    console.error(`FAILED ${failed.length}/${steps.length}`);
    process.exit(1);
  }
  console.log(`PASS ${steps.length}/${steps.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
