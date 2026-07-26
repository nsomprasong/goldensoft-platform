import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { foldLedgerBalance, money, parsePositiveAmount } from "../src/lib/billing/money";
import { permissionsForRoles, PLATFORM_PERMISSIONS } from "../src/lib/permissions/codes";

test("OWNER gets subscription summary only; ADMIN gets no billing by default", () => {
  const owner = permissionsForRoles({ platformRoles: [], organizationRoles: ["OWNER"] });
  const admin = permissionsForRoles({ platformRoles: [], organizationRoles: ["ADMIN"] });
  assert.ok(owner.includes(PLATFORM_PERMISSIONS.billingSubscriptionRead));
  assert.ok(!owner.includes(PLATFORM_PERMISSIONS.billingCreditRead));
  assert.ok(!owner.includes(PLATFORM_PERMISSIONS.billingInvoiceRead));
  assert.ok(!admin.some((code) => code.startsWith("billing.")));
});

test("BILLING_ADMIN receives full billing catalog", () => {
  const perms = permissionsForRoles({
    platformRoles: ["BILLING_ADMIN"],
    organizationRoles: [],
  });
  assert.ok(perms.includes(PLATFORM_PERMISSIONS.billingCreditAdjust));
  assert.ok(perms.includes(PLATFORM_PERMISSIONS.billingInvoiceManage));
  assert.ok(perms.includes(PLATFORM_PERMISSIONS.billingPaymentRecord));
});

test("billing role policy grants billing contact read-only billing access", () => {
  const permissions = permissionsForRoles({ platformRoles: [], organizationRoles: ["BILLING_CONTACT"] });
  assert.ok(permissions.includes(PLATFORM_PERMISSIONS.billingInvoiceRead));
  assert.ok(permissions.includes(PLATFORM_PERMISSIONS.billingContactManage));
  assert.ok(!permissions.includes(PLATFORM_PERMISSIONS.billingPaymentRecord));
  assert.ok(!permissions.includes(PLATFORM_PERMISSIONS.billingCreditAdjust));
});
test("money helpers reject non-positive and fold ledger deterministically", () => {
  assert.throws(() => parsePositiveAmount(0));
  assert.equal(foldLedgerBalance([{ amount: money(20), direction: "CREDIT" }, { amount: money(7), direction: "DEBIT" }]).toFixed(2), "13.00");
});
test("billing migration is additive and invite mode remains unchanged", async () => {
  const migration = await readFile(new URL("../prisma/migrations/0006_billing_credit_foundation/migration.sql", import.meta.url), "utf8");
  const env = await readFile(new URL("../.env.example", import.meta.url), "utf8").catch(() => "");
  assert.match(migration, /CREATE TABLE/i);
  assert.doesNotMatch(migration, /\bDROP\s+(TABLE|SCHEMA)\b/i);
  assert.match(env, /AUTH_INVITE_MODE=mock/);
  assert.doesNotMatch(env, /AUTH_INVITE_MODE=real/);
});
test("billing UI has no fake PromptPay checkout control", async () => {
  const page = await readFile(new URL("../src/app/billing/[organizationId]/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /ชำระด้วยพร้อมเพย์/i);
});
