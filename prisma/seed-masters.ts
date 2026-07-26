import type { PrismaClient } from "@prisma/client";

type MasterSeed = {
  code: string;
  nameTh: string;
  nameEn: string;
  description?: string;
  sortOrder: number;
};

async function upsertMaster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: { upsert: (args: any) => Promise<unknown> },
  row: MasterSeed,
) {
  await delegate.upsert({
    where: { code: row.code },
    create: {
      code: row.code,
      nameTh: row.nameTh,
      nameEn: row.nameEn,
      description: row.description ?? null,
      sortOrder: row.sortOrder,
      isActive: true,
      isSystem: true,
    },
    update: {
      nameTh: row.nameTh,
      nameEn: row.nameEn,
      description: row.description ?? null,
      sortOrder: row.sortOrder,
      isActive: true,
      isSystem: true,
    },
  });
}

export async function seedAllMasters(prisma: PrismaClient) {
  // Organization roles lost the global unique(code) in Phase 7 — upsert by
  // system scope (organizationId null) instead of the generic helper.
  for (const row of [
    { code: "OWNER", nameTh: "เจ้าของ", nameEn: "Owner", sortOrder: 1 },
    { code: "ADMIN", nameTh: "ผู้ดูแล", nameEn: "Admin", sortOrder: 2 },
    {
      code: "BILLING_CONTACT",
      nameTh: "ผู้ติดต่อการเงิน",
      nameEn: "Billing Contact",
      sortOrder: 3,
    },
  ]) {
    const existing = await prisma.organizationRole.findFirst({
      where: { code: row.code, organizationId: null },
    });
    if (existing) {
      await prisma.organizationRole.update({
        where: { id: existing.id },
        data: {
          nameTh: row.nameTh,
          nameEn: row.nameEn,
          sortOrder: row.sortOrder,
          isActive: true,
          isSystem: true,
        },
      });
    } else {
      await prisma.organizationRole.create({
        data: {
          code: row.code,
          nameTh: row.nameTh,
          nameEn: row.nameEn,
          sortOrder: row.sortOrder,
          isActive: true,
          isSystem: true,
          organizationId: null,
        },
      });
    }
  }

  const pairs: Array<[keyof PrismaClient, MasterSeed[]]> = [
    [
      "userProfileStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "DISABLED", nameTh: "ปิดใช้งาน", nameEn: "Disabled", sortOrder: 2 },
        { code: "PENDING", nameTh: "รอดำเนินการ", nameEn: "Pending", sortOrder: 3 },
      ],
    ],
    [
      "platformRole",
      [
        { code: "SUPER_ADMIN", nameTh: "ผู้ดูแลสูงสุด", nameEn: "Super Admin", sortOrder: 1 },
        { code: "SUPPORT", nameTh: "ฝ่ายสนับสนุน", nameEn: "Support", sortOrder: 2 },
        { code: "BILLING_ADMIN", nameTh: "ผู้ดูแลการเรียกเก็บเงิน", nameEn: "Billing Admin", sortOrder: 3 },
        { code: "SALES", nameTh: "ฝ่ายขาย", nameEn: "Sales", sortOrder: 4 },
        { code: "ACCOUNT_MANAGER", nameTh: "ผู้ดูแลบัญชีลูกค้า", nameEn: "Account Manager", sortOrder: 5 },
      ],
    ],
    [
      "assignmentStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "REVOKED", nameTh: "เพิกถอน", nameEn: "Revoked", sortOrder: 2 },
      ],
    ],
    [
      "organizationStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "SUSPENDED", nameTh: "ระงับ", nameEn: "Suspended", sortOrder: 2 },
        { code: "CLOSED", nameTh: "ปิด", nameEn: "Closed", sortOrder: 3 },
      ],
    ],
    [
      "branchStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "INACTIVE", nameTh: "ไม่ใช้งาน", nameEn: "Inactive", sortOrder: 2 },
      ],
    ],
    [
      "membershipStatus",
      [
        { code: "INVITED", nameTh: "เชิญแล้ว", nameEn: "Invited", sortOrder: 1 },
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 2 },
        { code: "SUSPENDED", nameTh: "ระงับ", nameEn: "Suspended", sortOrder: 3 },
        { code: "REMOVED", nameTh: "ถอดออก", nameEn: "Removed", sortOrder: 4 },
      ],
    ],
    [
      "branchScopeType",
      [
        { code: "ALL_BRANCHES", nameTh: "ทุกสาขา", nameEn: "All branches", sortOrder: 1 },
        { code: "SELECTED", nameTh: "สาขาที่เลือก", nameEn: "Selected", sortOrder: 2 },
        { code: "NONE", nameTh: "ไม่มีสิทธิ์สาขา", nameEn: "None", sortOrder: 3 },
      ],
    ],
    [
      "productStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "RETIRED", nameTh: "เลิกใช้", nameEn: "Retired", sortOrder: 2 },
      ],
    ],
    [
      "featureStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "RETIRED", nameTh: "เลิกใช้", nameEn: "Retired", sortOrder: 2 },
      ],
    ],
    [
      "planStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "RETIRED", nameTh: "เลิกใช้", nameEn: "Retired", sortOrder: 2 },
      ],
    ],
    [
      "planVersionStatus",
      [
        { code: "DRAFT", nameTh: "ฉบับร่าง", nameEn: "Draft", sortOrder: 1 },
        { code: "PUBLISHED", nameTh: "เผยแพร่", nameEn: "Published", sortOrder: 2 },
        { code: "RETIRED", nameTh: "เลิกใช้", nameEn: "Retired", sortOrder: 3 },
      ],
    ],
    [
      "billingCycle",
      [
        { code: "MONTHLY", nameTh: "รายเดือน", nameEn: "Monthly", sortOrder: 1 },
        { code: "YEARLY", nameTh: "รายปี", nameEn: "Yearly", sortOrder: 2 },
        { code: "MANUAL", nameTh: "กำหนดเอง", nameEn: "Manual", sortOrder: 3 },
      ],
    ],
    [
      "subscriptionStatus",
      [
        { code: "TRIAL", nameTh: "ทดลองใช้", nameEn: "Trial", sortOrder: 1 },
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 2 },
        { code: "PAST_DUE", nameTh: "ค้างชำระ", nameEn: "Past due", sortOrder: 3 },
        { code: "SUSPENDED", nameTh: "ระงับ", nameEn: "Suspended", sortOrder: 4 },
        { code: "CANCELLED", nameTh: "ยกเลิก", nameEn: "Cancelled", sortOrder: 5 },
        { code: "EXPIRED", nameTh: "หมดอายุ", nameEn: "Expired", sortOrder: 6 },
      ],
    ],
    [
      "subscriptionOverrideType",
      [
        { code: "GRANT", nameTh: "ให้สิทธิ์", nameEn: "Grant", sortOrder: 1 },
        { code: "REVOKE", nameTh: "เพิกถอน", nameEn: "Revoke", sortOrder: 2 },
        { code: "LIMIT", nameTh: "จำกัด", nameEn: "Limit", sortOrder: 3 },
      ],
    ],
    [
      "productMembershipStatus",
      [
        { code: "ACTIVE", nameTh: "ใช้งาน", nameEn: "Active", sortOrder: 1 },
        { code: "SUSPENDED", nameTh: "ระงับ", nameEn: "Suspended", sortOrder: 2 },
        { code: "REVOKED", nameTh: "เพิกถอน", nameEn: "Revoked", sortOrder: 3 },
      ],
    ],
    [
      "outboxEventStatus",
      [
        { code: "PENDING", nameTh: "รอดำเนินการ", nameEn: "Pending", sortOrder: 1 },
        { code: "PROCESSING", nameTh: "กำลังประมวลผล", nameEn: "Processing", sortOrder: 2 },
        { code: "PROCESSED", nameTh: "สำเร็จ", nameEn: "Processed", sortOrder: 3 },
        { code: "FAILED", nameTh: "ล้มเหลว", nameEn: "Failed", sortOrder: 4 },
        { code: "DEAD", nameTh: "ยุติ", nameEn: "Dead", sortOrder: 5 },
      ],
    ],
    [
      "idempotencyStatus",
      [
        { code: "IN_PROGRESS", nameTh: "กำลังดำเนินการ", nameEn: "In progress", sortOrder: 1 },
        { code: "COMPLETED", nameTh: "สำเร็จ", nameEn: "Completed", sortOrder: 2 },
        { code: "FAILED", nameTh: "ล้มเหลว", nameEn: "Failed", sortOrder: 3 },
      ],
    ],
    [
      "legacyMigrationStatus",
      [
        { code: "PENDING", nameTh: "รอดำเนินการ", nameEn: "Pending", sortOrder: 1 },
        { code: "LINKED", nameTh: "เชื่อมแล้ว", nameEn: "Linked", sortOrder: 2 },
        { code: "MIGRATED", nameTh: "ย้ายแล้ว", nameEn: "Migrated", sortOrder: 3 },
        { code: "FAILED", nameTh: "ล้มเหลว", nameEn: "Failed", sortOrder: 4 },
        { code: "IGNORED", nameTh: "ข้าม", nameEn: "Ignored", sortOrder: 5 },
      ],
    ],
    [
      "featureValueType",
      [
        { code: "STRING", nameTh: "ข้อความ", nameEn: "String", sortOrder: 1 },
        { code: "NUMBER", nameTh: "ตัวเลข", nameEn: "Number", sortOrder: 2 },
        { code: "BOOLEAN", nameTh: "ตรรกะ", nameEn: "Boolean", sortOrder: 3 },
      ],
    ],
    [
      "userInvitationStatus",
      [
        { code: "PENDING", nameTh: "รอส่งคำเชิญ", nameEn: "Pending", sortOrder: 1 },
        { code: "AUTH_SENT", nameTh: "ส่งคำเชิญแล้ว", nameEn: "Auth sent", sortOrder: 2 },
        { code: "COMPLETED", nameTh: "เปิดใช้งานแล้ว", nameEn: "Completed", sortOrder: 3 },
        { code: "FAILED", nameTh: "ส่งไม่สำเร็จ", nameEn: "Failed", sortOrder: 4 },
        {
          code: "PLATFORM_SETUP_FAILED",
          nameTh: "จัดเตรียมสิทธิ์ไม่สำเร็จ",
          nameEn: "Platform setup failed",
          sortOrder: 5,
        },
        { code: "CANCELLED", nameTh: "ยกเลิก", nameEn: "Cancelled", sortOrder: 6 },
        { code: "EXPIRED", nameTh: "หมดอายุ", nameEn: "Expired", sortOrder: 7 },
      ],
    ],
    [
      "auditActionType",
      [
        {
          code: "organization.bootstrap",
          nameTh: "สร้างองค์กร",
          nameEn: "Organization bootstrap",
          sortOrder: 1,
        },
        {
          code: "organization.create",
          nameTh: "สร้างองค์กร",
          nameEn: "Create organization",
          sortOrder: 2,
        },
        {
          code: "organization.update",
          nameTh: "แก้ไของค์กร",
          nameEn: "Update organization",
          sortOrder: 3,
        },
        {
          code: "organization.suspend",
          nameTh: "ระงับองค์กร",
          nameEn: "Suspend organization",
          sortOrder: 4,
        },
        {
          code: "organization.role.revoke",
          nameTh: "ถอดบทบาทองค์กร",
          nameEn: "Revoke organization role",
          sortOrder: 5,
        },
        {
          code: "branch.create",
          nameTh: "สร้างสาขา",
          nameEn: "Create branch",
          sortOrder: 6,
        },
        {
          code: "branch.update",
          nameTh: "แก้ไขสาขา",
          nameEn: "Update branch",
          sortOrder: 7,
        },
        {
          code: "branch.suspend",
          nameTh: "ระงับสาขา",
          nameEn: "Suspend branch",
          sortOrder: 8,
        },
        {
          code: "user.invite",
          nameTh: "เชิญผู้ใช้งาน",
          nameEn: "Invite user",
          sortOrder: 9,
        },
        {
          code: "user.reinvite",
          nameTh: "ส่งคำเชิญอีกครั้ง",
          nameEn: "Reinvite user",
          sortOrder: 10,
        },
        {
          code: "user.activate",
          nameTh: "เปิดใช้งานบัญชี",
          nameEn: "Activate user",
          sortOrder: 11,
        },
        {
          code: "user.suspend",
          nameTh: "ระงับบัญชี",
          nameEn: "Suspend user",
          sortOrder: 12,
        },
        {
          code: "membership.create",
          nameTh: "สร้างสมาชิกองค์กร",
          nameEn: "Create membership",
          sortOrder: 13,
        },
        {
          code: "membership.update",
          nameTh: "แก้ไขสมาชิกองค์กร",
          nameEn: "Update membership",
          sortOrder: 14,
        },
        {
          code: "role.assign",
          nameTh: "กำหนดบทบาท",
          nameEn: "Assign role",
          sortOrder: 15,
        },
        {
          code: "role.remove",
          nameTh: "ยกเลิกบทบาท",
          nameEn: "Remove role",
          sortOrder: 16,
        },
        {
          code: "context.switch",
          nameTh: "เปลี่ยนองค์กร/สาขา",
          nameEn: "Switch context",
          sortOrder: 17,
        },
        {
          code: "subscription.create",
          nameTh: "สร้างการสมัครใช้บริการ",
          nameEn: "Create subscription",
          sortOrder: 18,
        },
        { code: "user.invite.requested", nameTh: "ร้องขอส่งคำเชิญ", nameEn: "User invite requested", sortOrder: 19 },
        { code: "user.invite.sent", nameTh: "ส่งคำเชิญแล้ว", nameEn: "User invite sent", sortOrder: 20 },
        { code: "user.invite.failed", nameTh: "ส่งคำเชิญไม่สำเร็จ", nameEn: "User invite failed", sortOrder: 21 },
        { code: "user.reinvite.requested", nameTh: "ร้องขอส่งคำเชิญอีกครั้ง", nameEn: "User reinvite requested", sortOrder: 22 },
        { code: "user.reinvite.sent", nameTh: "ส่งคำเชิญอีกครั้งแล้ว", nameEn: "User reinvite sent", sortOrder: 23 },
        { code: "user.reinvite.failed", nameTh: "ส่งคำเชิญอีกครั้งไม่สำเร็จ", nameEn: "User reinvite failed", sortOrder: 24 },
        { code: "user.invite.accepted", nameTh: "ยอมรับคำเชิญ", nameEn: "User invite accepted", sortOrder: 25 },
        { code: "user.platform_setup.completed", nameTh: "จัดเตรียมสิทธิ์สำเร็จ", nameEn: "User platform setup completed", sortOrder: 26 },
        { code: "user.platform_setup.failed", nameTh: "จัดเตรียมสิทธิ์ไม่สำเร็จ", nameEn: "User platform setup failed", sortOrder: 27 },
        { code: "staff_portfolio.assign", nameTh: "กำหนดองค์กรลูกค้าให้พนักงาน", nameEn: "Assign customer organization to staff", sortOrder: 28 },
        { code: "staff_portfolio.revoke", nameTh: "ถอดองค์กรลูกค้าจากพนักงาน", nameEn: "Revoke customer organization from staff", sortOrder: 29 },
      ],
    ],
  ];

  for (const [key, rows] of pairs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[key];
    for (const row of rows) {
      await upsertMaster(delegate, row);
    }
  }
}
