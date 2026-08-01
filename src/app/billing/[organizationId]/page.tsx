import { PlatformShell } from "@/components/platform-shell";
import { PageHeader } from "@/components/ui/admin-ui";
import { requirePlatformPage } from "@/lib/auth/require-platform-page";
import { membershipOrganizationOptions } from "@/lib/auth/shell-props";
import { loadActorAccess } from "@/lib/auth/actor-access";
import {
  listCreditTransactions,
  getCreditBalance,
  serializeCreditTransaction,
} from "@/lib/billing/credit";
import { listBillingContacts } from "@/lib/billing/contacts";
import { getBillingSummary } from "@/lib/billing/summary";
import { serializeInvoice, serializePayment } from "@/lib/billing/serialize";
import { serializeMoney } from "@/lib/billing/money";
import { permissionsForRoles } from "@/lib/permissions/codes";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OrganizationBillingPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const ctx = await requirePlatformPage();
  const organizationId = (await params).organizationId;
  const actor = await loadActorAccess(prisma, ctx.user.id);
  const permissions = permissionsForRoles({
    platformRoles: actor.platformRoles,
    organizationRoles: actor.organizationRoles,
  });

  const [org, summary, credit, ledger, invoices, payments, contacts] =
    await Promise.all([
      prisma.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { id: true, displayName: true, customerCode: true },
      }),
      getBillingSummary(prisma, organizationId, permissions),
      getCreditBalance(prisma, organizationId),
      listCreditTransactions(prisma, { organizationId, take: 20 }),
      prisma.invoice.findMany({
        where: { organizationId },
        include: { status: true, items: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.payment.findMany({
        where: { organizationId },
        include: {
          status: true,
          paymentMethod: true,
          allocations: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      listBillingContacts(prisma, organizationId),
    ]);

  const shell = {
    displayName: ctx.bundle.profile?.displayName ?? "ผู้ใช้",
    platformRoles: ctx.bundle.platformRoles,
    organizationRoles: ctx.organizationRoles,
    organizations: membershipOrganizationOptions(ctx.bundle),
    branches: ctx.branches,
    activeOrganization: ctx.activeOrganization,
    activeBranch: ctx.activeBranch,
  };

  return (
    <PlatformShell {...shell}>
      <PageHeader
        title={`บัญชีการเงิน · ${org?.displayName ?? "องค์กร"}`}
        description="สร้างบัญชี ปรับเครดิต ออกใบแจ้งหนี้ และบันทึกชำระเงินมือ — ไม่มี PromptPay/Card ในเฟสนี้"
      />
      <div className="stack gap-4">
        <section className="card">
          <h2 className="font-semibold mb-2">สรุป</h2>
          <p>
            รหัส: {org?.customerCode ?? "—"} · บัญชี:{" "}
            {summary.hasBillingAccount ? "มี" : "ยังไม่มี"} · เครดิต:{" "}
            {summary.credit
              ? `${summary.credit.balance} ${summary.credit.currency}`
              : "—"}
          </p>
        </section>
        <section className="card">
          <h2 className="font-semibold mb-2">สมุดรายวันเครดิต (ล่าสุด)</h2>
          {ledger.rows.length === 0 ? (
            <p className="text-sm opacity-70">ยังไม่มีรายการ</p>
          ) : (
            <ul className="text-sm space-y-1">
              {ledger.rows.map((row) => {
                const s = serializeCreditTransaction(row);
                return (
                  <li key={s.id}>
                    {s.direction} {s.amount} · หลัง {s.balanceAfter} · {s.reason}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="card">
          <h2 className="font-semibold mb-2">ใบแจ้งหนี้</h2>
          <ul className="text-sm space-y-1">
            {invoices.map((row) => {
              const s = serializeInvoice(row);
              return (
                <li key={s.id}>
                  {s.invoiceNumber} · {s.statusLabelTh} · รวม {s.grandTotal} ·
                  ค้าง {s.outstandingTotal}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card">
          <h2 className="font-semibold mb-2">การชำระเงิน</h2>
          <ul className="text-sm space-y-1">
            {payments.map((row) => {
              const s = serializePayment(row);
              return (
                <li key={s.id}>
                  {s.paymentNumber} · {s.methodLabelTh} · {s.statusLabelTh} ·{" "}
                  {s.amount}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card">
          <h2 className="font-semibold mb-2">ผู้ติดต่อการเงิน</h2>
          <ul className="text-sm space-y-1">
            {contacts.map((c) => (
              <li key={c.id}>
                {c.name} · {c.email}
                {c.isPrimary ? " · หลัก" : ""}
                {c.isActive ? "" : " · ปิดใช้งาน"}
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <p className="text-sm opacity-70">
            การสร้างบัญชี / ปรับเครดิต / ออกใบแจ้งหนี้ / บันทึกชำระ ใช้ API
            `POST /api/platform/billing` พร้อมสิทธิ์รายคำสั่ง
            {credit
              ? ` · snapshot ${serializeMoney(credit.balance)} ${credit.currency}`
              : ""}
          </p>
        </section>
      </div>
    </PlatformShell>
  );
}
