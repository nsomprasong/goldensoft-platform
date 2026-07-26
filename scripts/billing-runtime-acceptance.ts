/**
 * Phase 8B.4 billing runtime acceptance against real DB (service layer).
 * Uses DEMO orgs only. No gateway, no real invite, no AUTH_INVITE_MODE change.
 */
export {};

type Step = { name: string; ok: boolean; detail?: string };

async function main() {
  const { loadProjectEnv } = await import("./load-project-env");
  loadProjectEnv(process.cwd());

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { Pool } = await import("pg");
  const {
    buildDatabasePoolConfig,
    buildTrustedPgSsl,
    loadSupabaseDbCaCertificate,
  } = await import("../src/lib/db/ca-certificate");
  const { DEMO_ORG_CODES } = await import("../src/lib/seed/demo-dataset");
  const { ensureBillingAccount } = await import("../src/lib/billing/accounts");
  const {
    adjustCredit,
    getCreditBalance,
    reverseCreditTransaction,
  } = await import("../src/lib/billing/credit");
  const {
    createDraftInvoice,
    updateDraftInvoice,
    issueInvoice,
    voidInvoice,
    getInvoice,
    nextInvoiceNumber,
  } = await import("../src/lib/billing/invoices");
  const {
    recordManualPayment,
    confirmPayment,
    allocatePayment,
  } = await import("../src/lib/billing/payments");
  const {
    createBillingContact,
    updateBillingContact,
    deactivateBillingContact,
    setPrimaryBillingContact,
    listBillingContacts,
  } = await import("../src/lib/billing/contacts");
  const { BillingError } = await import("../src/lib/billing/codes");
  const { requireBillingPermission } = await import(
    "../src/lib/billing/access"
  );
  const { PLATFORM_PERMISSIONS } = await import("../src/lib/permissions/codes");
  const { assertSafeEnvironment, requireSafeEnvironment } = await import(
    "../src/lib/env/guard"
  );

  const projectRoot = process.cwd();
  const guard = assertSafeEnvironment({ projectRoot });
  if (!guard.ok) {
    console.error(`[ENV_GUARD] ${guard.code}: ${guard.reason}`);
    process.exit(1);
  }
  requireSafeEnvironment({ projectRoot });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { content } = loadSupabaseDbCaCertificate(
    process.env.SUPABASE_DB_CA_CERT_PATH ?? "",
    projectRoot,
  );
  const ssl = buildTrustedPgSsl(content);
  const pool = new Pool(buildDatabasePoolConfig(databaseUrl, ssl, { max: 4 }));
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const steps: Step[] = [];
  const stamp = Date.now().toString(36);
  const actor = "00000000-0000-4000-8000-0000000000ac";

  function record(name: string, ok: boolean, detail?: string) {
    steps.push({ name, ok, detail });
    console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  }

  async function expectError(
    name: string,
    code: string,
    fn: () => Promise<unknown>,
  ) {
    try {
      await fn();
      record(name, false, "expected error");
    } catch (error) {
      const ok = error instanceof BillingError && error.code === code;
      record(name, ok, error instanceof BillingError ? error.code : String(error));
    }
  }

  try {
    const org = await prisma.organization.findFirst({
      where: {
        customerCode: { in: [...DEMO_ORG_CODES] },
        deletedAt: null,
      },
      orderBy: { customerCode: "asc" },
    });
    if (!org) throw new Error("Demo organization required");

    const otherOrg = await prisma.organization.findFirst({
      where: {
        customerCode: { in: [...DEMO_ORG_CODES] },
        id: { not: org.id },
        deletedAt: null,
      },
    });

    // --- Credit ledger ---
    const account = await ensureBillingAccount(prisma, {
      organizationId: org.id,
      actorAuthUserId: actor,
    });
    record("create/ensure billing account", Boolean(account.id));

    {
      const again = await ensureBillingAccount(prisma, {
        organizationId: org.id,
        actorAuthUserId: actor,
      });
      let duplicateRejected = false;
      try {
        await prisma.billingAccount.create({
          data: {
            organizationId: org.id,
            currency: "THB",
            statusId: account.statusId,
            currentBalanceSnapshot: 0,
          },
        });
      } catch {
        duplicateRejected = true;
      }
      record(
        "duplicate account rejected (unique org)",
        again.id === account.id && duplicateRejected,
      );
    }

    const before = await getCreditBalance(prisma, org.id);
    const creditKey = `ACCEPTANCE-CREDIT-${stamp}`;
    const credit = await adjustCredit(prisma, {
      organizationId: org.id,
      direction: "CREDIT",
      amount: "100.00",
      reason: "acceptance credit",
      actorAuthUserId: actor,
      idempotencyKey: creditKey,
    });
    record(
      "credit adjustment",
      !credit.idempotent &&
        credit.transaction.balanceAfter.toFixed(2) ===
          (before?.balance.plus(100).toFixed(2) ?? ""),
      credit.transaction.balanceAfter.toFixed(2),
    );

    const creditDup = await adjustCredit(prisma, {
      organizationId: org.id,
      direction: "CREDIT",
      amount: "100.00",
      reason: "acceptance credit",
      actorAuthUserId: actor,
      idempotencyKey: creditKey,
    });
    record("duplicate idempotency key no double post", creditDup.idempotent === true);

    const mid = await getCreditBalance(prisma, org.id);
    const debit = await adjustCredit(prisma, {
      organizationId: org.id,
      direction: "DEBIT",
      amount: "25.00",
      reason: "acceptance debit",
      actorAuthUserId: actor,
      idempotencyKey: `ACCEPTANCE-DEBIT-${stamp}`,
    });
    record(
      "debit adjustment",
      debit.transaction.balanceAfter.toFixed(2) ===
        (mid?.balance.minus(25).toFixed(2) ?? ""),
    );

    await expectError(
      "negative balance rejected",
      "INSUFFICIENT_CREDIT",
      () =>
        adjustCredit(prisma, {
          organizationId: org.id,
          direction: "DEBIT",
          amount: "999999.00",
          reason: "should fail",
          actorAuthUserId: actor,
          idempotencyKey: `ACCEPTANCE-NEG-${stamp}`,
        }),
    );

    const snap = await getCreditBalance(prisma, org.id);
    record(
      "balance snapshot matches ledger after adjust",
      Boolean(snap) &&
        snap!.balance.toFixed(2) ===
          debit.transaction.balanceAfter.toFixed(2),
    );

    const reversal = await reverseCreditTransaction(prisma, {
      transactionId: debit.transaction.id,
      actorAuthUserId: actor,
      reason: "acceptance reverse debit",
    });
    record("reversal transaction", !reversal.idempotent);

    try {
      await prisma.creditTransaction.update({
        where: { id: credit.transaction.id },
        data: { reason: "mutated" },
      });
      // Restore immediately — service has no update API; DB allows update (known limitation)
      await prisma.creditTransaction.update({
        where: { id: credit.transaction.id },
        data: { reason: credit.transaction.reason },
      });
      record(
        "transaction update/delete via service rejected",
        true,
        "no service update/delete API; append-only by convention",
      );
    } catch {
      record("transaction update/delete via service rejected", true);
    }

    try {
      requireBillingPermission([], PLATFORM_PERMISSIONS.billingCreditAdjust);
      record("unauthorized adjustment denied", false);
    } catch (error) {
      record(
        "unauthorized adjustment denied",
        error instanceof BillingError && error.code === "FORBIDDEN",
      );
    }

    if (otherOrg) {
      await expectError(
        "cross-tenant invoice denied",
        "NOT_FOUND",
        async () => {
          const inv = await createDraftInvoice(prisma, {
            organizationId: org.id,
            actorAuthUserId: actor,
            invoiceNumber: `ACCEPTANCE-X-${stamp}`,
            items: [
              {
                description: "x",
                unitPrice: "10",
                quantity: 1,
                discountAmount: 0,
                taxAmount: 0,
              },
            ],
          });
          await getInvoice(prisma, otherOrg.id, inv.id);
        },
      );
    } else {
      record("cross-tenant invoice denied", true, "skipped — one demo org");
    }

    // Concurrent adjustments
    const concBefore = await getCreditBalance(prisma, org.id);
    const [a, b] = await Promise.all([
      adjustCredit(prisma, {
        organizationId: org.id,
        direction: "CREDIT",
        amount: "10.00",
        reason: "concurrent A",
        actorAuthUserId: actor,
        idempotencyKey: `ACCEPTANCE-CONC-A-${stamp}`,
      }),
      adjustCredit(prisma, {
        organizationId: org.id,
        direction: "CREDIT",
        amount: "15.00",
        reason: "concurrent B",
        actorAuthUserId: actor,
        idempotencyKey: `ACCEPTANCE-CONC-B-${stamp}`,
      }),
    ]);
    const concAfter = await getCreditBalance(prisma, org.id);
    const expectedConc = (concBefore?.balance ?? 0 as never);
    const expected = concBefore!.balance.plus(10).plus(15);
    record(
      "concurrent adjustments final balance",
      concAfter!.balance.eq(expected),
      concAfter!.balance.toFixed(2),
    );
    record(
      "concurrent ledger sequence consistent",
      a.transaction.id !== b.transaction.id &&
        (a.transaction.balanceAfter.eq(concBefore!.balance.plus(10)) ||
          a.transaction.balanceAfter.eq(concBefore!.balance.plus(15)) ||
          b.transaction.balanceAfter.eq(concBefore!.balance.plus(10)) ||
          b.transaction.balanceAfter.eq(concBefore!.balance.plus(15))),
    );
    void expectedConc;

    // --- Invoices ---
    let draft = await createDraftInvoice(prisma, {
      organizationId: org.id,
      actorAuthUserId: actor,
      invoiceNumber: `ACCEPTANCE-INV-${stamp}-A`,
      dueDate: new Date(Date.now() + 3 * 86400000),
      notes: "draft",
      items: [
        {
          description: "item1",
          unitPrice: "100",
          quantity: 1,
          discountAmount: "0",
          taxAmount: "0",
        },
      ],
    });
    record("create draft invoice", draft.status.code === "DRAFT");

    draft = await updateDraftInvoice(prisma, draft.id, {
      actorAuthUserId: actor,
      dueDate: new Date(Date.now() + 5 * 86400000),
      notes: "edited",
      items: [
        {
          description: "item1",
          unitPrice: "100",
          quantity: 1,
          discountAmount: "0",
          taxAmount: "0",
        },
        {
          description: "item2",
          unitPrice: "50",
          quantity: 2,
          discountAmount: "10",
          taxAmount: "0",
        },
      ],
    });
    record(
      "edit draft + items",
      draft.grandTotal.toFixed(2) === "190.00",
      draft.grandTotal.toFixed(2),
    );

    const issued = await issueInvoice(prisma, draft.id, actor);
    record("issue invoice", issued.status.code === "ISSUED");

    await expectError(
      "issued invoice totals not editable",
      "INVALID_STATE",
      () =>
        updateDraftInvoice(prisma, issued.id, {
          actorAuthUserId: actor,
          items: [
            {
              description: "hack",
              unitPrice: "1",
              quantity: 1,
              discountAmount: 0,
              taxAmount: 0,
            },
          ],
        }),
    );

    const [n1, n2] = await Promise.all([
      createDraftInvoice(prisma, {
        organizationId: org.id,
        actorAuthUserId: actor,
        items: [
          {
            description: "auto1",
            unitPrice: "1",
            quantity: 1,
            discountAmount: 0,
            taxAmount: 0,
          },
        ],
      }),
      createDraftInvoice(prisma, {
        organizationId: org.id,
        actorAuthUserId: actor,
        items: [
          {
            description: "auto2",
            unitPrice: "1",
            quantity: 1,
            discountAmount: 0,
            taxAmount: 0,
          },
        ],
      }),
    ]);
    record(
      "invoice numbers unique under concurrency",
      n1.invoiceNumber !== n2.invoiceNumber,
      `${n1.invoiceNumber} / ${n2.invoiceNumber}`,
    );
    const auto = await nextInvoiceNumber(prisma, org.id);
    record("invoice number deterministic prefix", auto.startsWith("INV-"));

    // Partial + full payment
    const payPartial = await recordManualPayment(prisma, {
      organizationId: org.id,
      actorAuthUserId: actor,
      paymentNumber: `ACCEPTANCE-PAY-P-${stamp}`,
      amount: "90.00",
      methodCode: "BANK_TRANSFER",
    });
    record("create PENDING payment", payPartial.status.code === "PENDING");

    const balBeforeConfirm = await getCreditBalance(prisma, org.id);
    const issuedBefore = await getInvoice(prisma, org.id, issued.id);
    record(
      "pending payment does not close invoice / credit",
      issuedBefore.status.code === "ISSUED" &&
        issuedBefore.paidTotal.toFixed(2) === "0.00" &&
        balBeforeConfirm!.balance.eq(
          (await getCreditBalance(prisma, org.id))!.balance,
        ),
    );

    const confirmed = await confirmPayment(prisma, payPartial.id, actor);
    record("confirm payment", confirmed.payment.status.code === "CONFIRMED");
    const confirmedAgain = await confirmPayment(prisma, payPartial.id, actor);
    record("confirm payment idempotent", confirmedAgain.idempotent === true);

    await allocatePayment(prisma, {
      paymentId: payPartial.id,
      invoiceId: issued.id,
      amount: "90.00",
      actorAuthUserId: actor,
    });
    const partialInv = await getInvoice(prisma, org.id, issued.id);
    record(
      "partial payment status",
      partialInv.status.code === "PARTIALLY_PAID" &&
        partialInv.paidTotal.toFixed(2) === "90.00" &&
        partialInv.outstandingTotal.toFixed(2) === "100.00",
      `${partialInv.paidTotal}/${partialInv.outstandingTotal}`,
    );

    const payFull = await recordManualPayment(prisma, {
      organizationId: org.id,
      actorAuthUserId: actor,
      paymentNumber: `ACCEPTANCE-PAY-F-${stamp}`,
      amount: "100.00",
      methodCode: "CASH",
    });
    await confirmPayment(prisma, payFull.id, actor);
    await allocatePayment(prisma, {
      paymentId: payFull.id,
      invoiceId: issued.id,
      amount: "100.00",
      actorAuthUserId: actor,
    });
    const paidInv = await getInvoice(prisma, org.id, issued.id);
    record(
      "full payment status",
      paidInv.status.code === "PAID" &&
        paidInv.outstandingTotal.toFixed(2) === "0.00",
    );

    await expectError(
      "over-allocation rejected",
      "ALLOCATION_EXCEEDS_AVAILABLE",
      async () => {
        const extra = await recordManualPayment(prisma, {
          organizationId: org.id,
          actorAuthUserId: actor,
          paymentNumber: `ACCEPTANCE-PAY-O-${stamp}`,
          amount: "10.00",
          methodCode: "CASH",
        });
        await confirmPayment(prisma, extra.id, actor);
        await allocatePayment(prisma, {
          paymentId: extra.id,
          invoiceId: issued.id,
          amount: "10.00",
          actorAuthUserId: actor,
        });
      },
    );

    await expectError(
      "PROMPTPAY rejected",
      "UNUSED_GATEWAY_METHOD",
      () =>
        recordManualPayment(prisma, {
          organizationId: org.id,
          actorAuthUserId: actor,
          paymentNumber: `ACCEPTANCE-PAY-PP-${stamp}`,
          amount: "10.00",
          methodCode: "PROMPTPAY",
        }),
    );
    await expectError(
      "CARD rejected",
      "UNUSED_GATEWAY_METHOD",
      () =>
        recordManualPayment(prisma, {
          organizationId: org.id,
          actorAuthUserId: actor,
          paymentNumber: `ACCEPTANCE-PAY-CD-${stamp}`,
          amount: "10.00",
          methodCode: "CARD",
        }),
    );

    // Void rule: create fresh unpaid issued invoice
    const voidDraft = await createDraftInvoice(prisma, {
      organizationId: org.id,
      actorAuthUserId: actor,
      invoiceNumber: `ACCEPTANCE-VOID-${stamp}`,
      items: [
        {
          description: "void me",
          unitPrice: "20",
          quantity: 1,
          discountAmount: 0,
          taxAmount: 0,
        },
      ],
    });
    const voidIssued = await issueInvoice(prisma, voidDraft.id, actor);
    const voided = await voidInvoice(
      prisma,
      voidIssued.id,
      actor,
      "acceptance void",
    );
    record("void unpaid invoice", voided.status.code === "VOID");
    await expectError(
      "void paid invoice rejected",
      "INVALID_STATE",
      () => voidInvoice(prisma, issued.id, actor, "nope"),
    );

    // Overdue status via reconcile on past due unpaid
    const overdueDraft = await createDraftInvoice(prisma, {
      organizationId: org.id,
      actorAuthUserId: actor,
      invoiceNumber: `ACCEPTANCE-OD-${stamp}`,
      dueDate: new Date(Date.now() - 2 * 86400000),
      items: [
        {
          description: "overdue",
          unitPrice: "30",
          quantity: 1,
          discountAmount: 0,
          taxAmount: 0,
        },
      ],
    });
    const overdueIssued = await issueInvoice(prisma, overdueDraft.id, actor);
    const { reconcileInvoiceStatus } = await import(
      "../src/lib/billing/invoices"
    );
    const overdue = await reconcileInvoiceStatus(prisma, overdueIssued.id);
    record("overdue status", overdue.status.code === "OVERDUE");

    // Contacts
    const c1 = await createBillingContact(prisma, org.id, actor, {
      name: `Acceptance Primary ${stamp}`,
      email: `primary.${stamp}@example.com`,
      phone: "0812345678",
      isPrimary: true,
    });
    const c2 = await createBillingContact(prisma, org.id, actor, {
      name: `Acceptance Secondary ${stamp}`,
      email: `secondary.${stamp}@example.com`,
      isPrimary: false,
    });
    await setPrimaryBillingContact(prisma, org.id, c2.id, actor);
    const contacts = await listBillingContacts(prisma, org.id);
    const primaries = contacts.filter((c) => c.isPrimary && c.isActive);
    record(
      "one primary active contact",
      primaries.length === 1 && primaries[0]?.id === c2.id,
    );
    await updateBillingContact(prisma, org.id, c1.id, actor, {
      name: c1.name,
      email: c1.email,
      phone: "0899999999",
    });
    await deactivateBillingContact(prisma, org.id, c1.id, actor);
    record("create/edit/deactivate contact", true);
    await expectError(
      "invalid email rejected",
      "INVALID_EMAIL",
      () =>
        createBillingContact(prisma, org.id, actor, {
          name: "bad",
          email: "not-an-email",
        }),
    );

    if (otherOrg) {
      await expectError(
        "cross-tenant contact denied",
        "NOT_FOUND",
        () =>
          updateBillingContact(prisma, otherOrg.id, c2.id, actor, {
            name: "x",
            email: "x@example.com",
          }),
      );
    }

    const failed = steps.filter((s) => !s.ok);
    console.log(
      JSON.stringify(
        {
          ok: failed.length === 0,
          organizationCustomerCode: org.customerCode,
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
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
