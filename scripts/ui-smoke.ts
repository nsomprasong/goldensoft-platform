import { chromium } from "playwright";

import { loadProjectEnv } from "./load-project-env";

loadProjectEnv(process.cwd());
process.env.ALLOW_TEST_AUTH = "true";

const baseUrl = process.env.UI_SMOKE_BASE_URL ?? "http://localhost:3000";

async function createPrisma() {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    process.cwd(),
  );
  const pool = new Pool(
    buildDatabasePoolConfig(databaseUrl, buildTrustedPgSsl(content), { max: 1 }),
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return { prisma, pool };
}

async function main() {
  const { prisma, pool } = await createPrisma();
  const browser = await chromium.launch({ headless: true });
  try {
    const profile = await prisma.userProfile.findFirst({
      where: {
        deletedAt: null,
        platformRoles: {
          some: { revokedAt: null, role: { code: "SUPER_ADMIN" } },
        },
      },
      select: { authUserId: true, email: true },
    });
    if (!profile) throw new Error("SUPER_ADMIN profile missing");

    const context = await browser.newContext({
      extraHTTPHeaders: {
        "x-test-auth-user-id": profile.authUserId,
        "x-test-auth-email": profile.email,
      },
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().includes("/_next/webpack-hmr")
      ) {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const results: Array<{
      viewport: number;
      route: string;
      overflow: boolean;
      mobileSheet?: boolean;
      overflowElements?: string[];
    }> = [];

    for (const viewport of [375, 768, 1280]) {
      await page.setViewportSize({ width: viewport, height: 900 });
      for (const route of [
        "/",
        "/organizations",
        "/users",
        "/products",
        "/plans",
        "/subscriptions",
        "/roles",
        "/audit-logs",
        "/settings",
      ]) {
        await page.goto(`${baseUrl}${route}`, {
          waitUntil: "networkidle",
          timeout: 90_000,
        });
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 2,
        );
        const overflowElements = overflow
          ? await page.evaluate(() =>
              [...document.querySelectorAll<HTMLElement>("body *")]
                .filter(
                  (element) =>
                    element.getBoundingClientRect().right >
                    document.documentElement.clientWidth + 2,
                )
                .slice(0, 5)
                .map(
                  (element) => {
                    const rect = element.getBoundingClientRect();
                    return `${element.tagName.toLowerCase()}.${[...element.classList].join(".")} right=${Math.round(rect.right)} width=${Math.round(rect.width)} scroll=${element.scrollWidth}`;
                  },
                ),
            )
          : undefined;

        let mobileSheet: boolean | undefined;
        if (route === "/" && viewport < 1200) {
          await page.getByRole("button", { name: "เปิดเมนู" }).click();
          mobileSheet =
            (await page.getByRole("dialog", { name: "เมนูนำทาง" }).count()) === 1;
          await page.keyboard.press("Escape");
        }
        results.push({
          viewport,
          route,
          overflow,
          mobileSheet,
          overflowElements,
        });
      }
    }

    const failed = results.filter(
      (result) => result.overflow || result.mobileSheet === false,
    );
    console.log(
      JSON.stringify(
        { results, consoleErrors: errors.length, errors: errors.slice(0, 10) },
        null,
        2,
      ),
    );
    if (failed.length > 0 || errors.length > 0) {
      throw new Error(
        `UI smoke failed: layout=${failed.length}, console=${errors.length}`,
      );
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
