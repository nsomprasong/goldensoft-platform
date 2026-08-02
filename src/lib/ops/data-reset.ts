import type { PrismaClient } from "@prisma/client";

import {
  DATA_RESET_CONFIRM_PHRASE,
  PROTECTED_ORG_CODE,
  type DataResetCatalogTargets,
  type DataResetPreview,
  type DataResetSelection,
  type DataResetTargetOrg,
} from "@/lib/ops/data-reset-types";
import { MASTER } from "@/lib/platform/master-codes";
import {
  planPurge,
  purgeData,
  type PurgePlan,
  PurgeSafetyError,
} from "@/lib/seed/purge-dataset";

export {
  DATA_RESET_CONFIRM_PHRASE,
  PROTECTED_ORG_CODE,
  type DataResetCatalogTargets,
  type DataResetPreview,
  type DataResetSelection,
  type DataResetTargetOrg,
};

function unique(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export async function listDataResetTargets(
  db: PrismaClient,
): Promise<DataResetTargetOrg[]> {
  const orgs = await db.organization.findMany({
    select: {
      id: true,
      customerCode: true,
      displayName: true,
      branches: {
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      },
    },
    orderBy: { customerCode: "asc" },
  });
  return orgs.map((org) => {
    const protectedOrg = org.customerCode.toUpperCase() === PROTECTED_ORG_CODE;
    return {
      id: org.id,
      customerCode: org.customerCode,
      displayName: org.displayName,
      protected: protectedOrg,
      branches: org.branches.map((branch) => ({
        id: branch.id,
        code: branch.code,
        name: branch.name,
        protected: protectedOrg,
      })),
    };
  });
}

export async function listDataResetCatalog(
  db: PrismaClient,
): Promise<DataResetCatalogTargets> {
  const [products, plans, subscriptions] = await Promise.all([
    db.product.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { plans: true } },
      },
      orderBy: { code: "asc" },
    }),
    db.plan.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        productId: true,
        product: { select: { code: true } },
      },
      orderBy: [{ product: { code: "asc" } }, { code: "asc" }],
    }),
    db.subscription.findMany({
      select: {
        id: true,
        organizationId: true,
        planCode: true,
        organization: { select: { customerCode: true, displayName: true } },
        product: { select: { code: true } },
        status: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      planCount: p._count.plans,
    })),
    plans: plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      productId: p.productId,
      productCode: p.product.code,
    })),
    subscriptions: subscriptions.map((s) => ({
      id: s.id,
      organizationId: s.organizationId,
      organizationCode: s.organization.customerCode,
      organizationName: s.organization.displayName,
      productCode: s.product.code,
      planCode: s.planCode,
      statusCode: s.status.code,
    })),
  };
}

async function listSuperAdminEmails(db: PrismaClient): Promise<string[]> {
  const rows = await db.platformRoleAssignment.findMany({
    where: {
      revokedAt: null,
      role: { code: MASTER.platformRole.SUPER_ADMIN },
      status: { code: MASTER.assignmentStatus.ACTIVE },
    },
    select: { userProfile: { select: { email: true } } },
  });
  return [
    ...new Set(
      rows
        .map((row) => row.userProfile.email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

type ResolvedCatalog = {
  products: { id: string; code: string; name: string }[];
  plans: { id: string; code: string; name: string; productCode: string }[];
  subscriptions: {
    id: string;
    organizationCode: string;
    productCode: string;
    planCode: string;
  }[];
  productIds: string[];
  planIds: string[];
  subscriptionIds: string[];
};

async function resolveCatalogSelection(
  db: PrismaClient,
  selection: DataResetSelection,
): Promise<ResolvedCatalog> {
  const productIds = unique(selection.productIds);
  const planIdsIn = unique(selection.planIds);
  const subscriptionIdsIn = unique(selection.subscriptionIds);

  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      })
    : [];
  if (products.length !== productIds.length) {
    throw new PurgeSafetyError("พบรหัสผลิตภัณฑ์ที่ไม่ถูกต้อง");
  }

  const plansFromProducts =
    productIds.length > 0
      ? await db.plan.findMany({
          where: { productId: { in: productIds } },
          select: {
            id: true,
            code: true,
            name: true,
            product: { select: { code: true } },
          },
        })
      : [];

  const plansSelected = planIdsIn.length
    ? await db.plan.findMany({
        where: { id: { in: planIdsIn } },
        select: {
          id: true,
          code: true,
          name: true,
          product: { select: { code: true } },
        },
      })
    : [];
  if (plansSelected.length !== planIdsIn.length) {
    throw new PurgeSafetyError("พบรหัสแพ็กเกจที่ไม่ถูกต้อง");
  }

  const planMap = new Map<string, (typeof plansSelected)[number]>();
  for (const plan of [...plansFromProducts, ...plansSelected]) {
    planMap.set(plan.id, plan);
  }
  const plans = [...planMap.values()].map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    productCode: p.product.code,
  }));
  const planIds = plans.map((p) => p.id);

  const subsFromCatalog =
    productIds.length > 0 || planIds.length > 0
      ? await db.subscription.findMany({
          where: {
            OR: [
              productIds.length ? { productId: { in: productIds } } : undefined,
              planIds.length ? { planId: { in: planIds } } : undefined,
            ].filter(Boolean) as Array<
              { productId: { in: string[] } } | { planId: { in: string[] } }
            >,
          },
          select: {
            id: true,
            planCode: true,
            organization: { select: { customerCode: true } },
            product: { select: { code: true } },
          },
        })
      : [];

  const subsSelected = subscriptionIdsIn.length
    ? await db.subscription.findMany({
        where: { id: { in: subscriptionIdsIn } },
        select: {
          id: true,
          planCode: true,
          organization: { select: { customerCode: true } },
          product: { select: { code: true } },
        },
      })
    : [];
  if (subsSelected.length !== subscriptionIdsIn.length) {
    throw new PurgeSafetyError("พบรหัสการสมัครใช้บริการที่ไม่ถูกต้อง");
  }

  const subMap = new Map<string, (typeof subsSelected)[number]>();
  for (const sub of [...subsFromCatalog, ...subsSelected]) {
    subMap.set(sub.id, sub);
  }
  const subscriptions = [...subMap.values()].map((s) => ({
    id: s.id,
    organizationCode: s.organization.customerCode,
    productCode: s.product.code,
    planCode: s.planCode,
  }));

  return {
    products,
    plans,
    subscriptions,
    productIds: products.map((p) => p.id),
    planIds,
    subscriptionIds: subscriptions.map((s) => s.id),
  };
}

export async function previewDataReset(
  db: PrismaClient,
  selection: DataResetSelection,
): Promise<DataResetPreview> {
  const catalog = await resolveCatalogSelection(db, selection);
  const hasCatalog =
    catalog.productIds.length > 0 ||
    catalog.planIds.length > 0 ||
    catalog.subscriptionIds.length > 0;

  if (selection.selectAll) {
    const keepEmails = await listSuperAdminEmails(db);
    if (keepEmails.length === 0) {
      throw new PurgeSafetyError(
        "ไม่พบบัญชีผู้ดูแลระบบสูงสุดที่ใช้งานอยู่ — กำหนด SUPER_ADMIN ก่อนล้างข้อมูล",
      );
    }
    const plan = await planPurge(db, {
      keepEmails,
      keepOrganizationCodes: [PROTECTED_ORG_CODE],
      allowProduction: true,
    });
    return {
      mode: "reset_all",
      keptOrganizationCodes: [PROTECTED_ORG_CODE],
      keptSuperAdminEmails: keepEmails,
      organizations: plan.organizations,
      branches: [],
      ...catalog,
      orphanProfiles: plan.profiles,
      counts: {
        ...plan.counts,
        selectedBranches: 0,
        catalogProducts: catalog.products.length,
        catalogPlans: catalog.plans.length,
        catalogSubscriptions: catalog.subscriptions.length,
        hrOrganizationScoped: "จะล้างข้อมูล HR ขององค์กรที่ถูกลบ (ถ้ามี schema hr)",
      },
      warnings: [
        "โหมดเลือกทั้งหมด (องค์กร): เหลือเฉพาะองค์กร GOLDENSOFT และบัญชีผู้ดูแลระบบสูงสุด",
        ...(hasCatalog
          ? [
              "จะลบผลิตภัณฑ์/แพ็กเกจ/การสมัครที่เลือกด้วย (การสมัครที่ผูกกับผลิตภัณฑ์/แพ็กเกจที่เลือกจะถูกลบอัตโนมัติ)",
            ]
          : []),
        "ไม่ลบผู้ใช้ใน Supabase Auth — ลบโปรไฟล์ใน Platform เท่านั้น",
      ],
    };
  }

  return previewSelected(db, selection, catalog, hasCatalog);
}

async function previewSelected(
  db: PrismaClient,
  selection: DataResetSelection,
  catalog: ResolvedCatalog,
  hasCatalog: boolean,
): Promise<DataResetPreview> {
  const organizationIds = unique(selection.organizationIds);
  const branchIds = unique(selection.branchIds);
  const hasTenant = organizationIds.length > 0 || branchIds.length > 0;
  if (!hasTenant && !hasCatalog) {
    throw new PurgeSafetyError(
      "กรุณาเลือกองค์กร สาขา ผลิตภัณฑ์ แพ็กเกจ หรือการสมัครใช้บริการที่ต้องการลบ",
    );
  }

  const protectedOrg = await db.organization.findFirst({
    where: { customerCode: PROTECTED_ORG_CODE },
    select: { id: true },
  });
  if (protectedOrg && organizationIds.includes(protectedOrg.id)) {
    throw new PurgeSafetyError(
      `ห้ามลบองค์กร ${PROTECTED_ORG_CODE} — ใช้เป็นองค์กรระบบ`,
    );
  }

  const organizations = organizationIds.length
    ? await db.organization.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, customerCode: true, displayName: true },
        orderBy: { customerCode: "asc" },
      })
    : [];
  if (organizations.length !== organizationIds.length) {
    throw new PurgeSafetyError("พบรหัสองค์กรที่ไม่ถูกต้อง");
  }

  const branches = branchIds.length
    ? await db.branch.findMany({
        where: {
          id: { in: branchIds },
          ...(protectedOrg ? { organizationId: { not: protectedOrg.id } } : {}),
        },
        select: {
          id: true,
          code: true,
          name: true,
          organizationId: true,
          organization: { select: { customerCode: true } },
        },
        orderBy: { code: "asc" },
      })
    : [];
  const orgIdSet = new Set(organizationIds);
  const standaloneBranches = branches.filter(
    (branch) => !orgIdSet.has(branch.organizationId),
  );
  if (
    branchIds.length > 0 &&
    branches.length === 0 &&
    organizationIds.length === 0 &&
    !hasCatalog
  ) {
    throw new PurgeSafetyError(
      "สาขาที่เลือกอยู่ในองค์กรระบบ หรือไม่พบสาขา — ไม่สามารถลบได้",
    );
  }

  const orphanProfiles = await findOrphanProfilesAfterOrgDelete(
    db,
    organizationIds,
  );

  const orgFilter = { organizationId: { in: organizationIds } };
  const counts: Record<string, number | string> = {
    organizations: organizations.length,
    userProfiles: orphanProfiles.length,
    selectedBranches: standaloneBranches.length,
    catalogProducts: catalog.products.length,
    catalogPlans: catalog.plans.length,
    catalogSubscriptions: catalog.subscriptions.length,
    paymentAllocations:
      organizationIds.length === 0
        ? 0
        : await db.paymentAllocation.count({
            where: { OR: [{ payment: orgFilter }, { invoice: orgFilter }] },
          }),
    invoices:
      organizationIds.length === 0
        ? 0
        : await db.invoice.count({ where: orgFilter }),
    entitlements:
      organizationIds.length === 0
        ? 0
        : await db.entitlement.count({ where: orgFilter }),
    subscriptions:
      organizationIds.length === 0
        ? 0
        : await db.subscription.count({ where: orgFilter }),
    branches:
      (organizationIds.length === 0
        ? 0
        : await db.branch.count({ where: orgFilter })) +
      standaloneBranches.length,
    hrOrganizationScoped:
      organizationIds.length > 0
        ? "จะล้างข้อมูล HR ขององค์กรที่เลือก (ถ้ามี)"
        : 0,
  };

  return {
    mode: "selected",
    keptOrganizationCodes: [PROTECTED_ORG_CODE],
    keptSuperAdminEmails: await listSuperAdminEmails(db),
    organizations,
    branches: standaloneBranches.map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      organizationId: branch.organizationId,
      organizationCode: branch.organization.customerCode,
    })),
    products: catalog.products,
    plans: catalog.plans,
    subscriptions: catalog.subscriptions,
    orphanProfiles,
    counts,
    warnings: [
      "องค์กร GOLDENSOFT และสาขาขององค์กรนี้ถูกล็อกไม่ให้ลบ",
      "บัญชีผู้ดูแลระบบสูงสุดจะไม่ถูกลบ",
      "ไม่ลบผู้ใช้ใน Supabase Auth",
      ...(hasCatalog
        ? [
            "ลบผลิตภัณฑ์/แพ็กเกจจะลบการสมัครที่ใช้รายการนั้นด้วย",
          ]
        : []),
    ],
  };
}

async function findOrphanProfilesAfterOrgDelete(
  db: PrismaClient,
  organizationIds: string[],
): Promise<{ id: string; email: string }[]> {
  if (organizationIds.length === 0) return [];
  const members = await db.organizationMembership.findMany({
    where: { organizationId: { in: organizationIds } },
    select: { userProfileId: true },
  });
  const candidateIds = [...new Set(members.map((row) => row.userProfileId))];
  if (candidateIds.length === 0) return [];

  const stillLinked = await db.organizationMembership.findMany({
    where: {
      userProfileId: { in: candidateIds },
      organizationId: { notIn: organizationIds },
    },
    select: { userProfileId: true },
  });
  const stillLinkedSet = new Set(stillLinked.map((row) => row.userProfileId));

  const superAdmins = await db.platformRoleAssignment.findMany({
    where: {
      userProfileId: { in: candidateIds },
      revokedAt: null,
      role: { code: MASTER.platformRole.SUPER_ADMIN },
      status: { code: MASTER.assignmentStatus.ACTIVE },
    },
    select: { userProfileId: true },
  });
  const superSet = new Set(superAdmins.map((row) => row.userProfileId));

  const platformStaff = await db.platformRoleAssignment.findMany({
    where: {
      userProfileId: { in: candidateIds },
      revokedAt: null,
      status: { code: MASTER.assignmentStatus.ACTIVE },
    },
    select: { userProfileId: true },
  });
  const staffSet = new Set(platformStaff.map((row) => row.userProfileId));

  const orphanIds = candidateIds.filter(
    (id) => !stillLinkedSet.has(id) && !superSet.has(id) && !staffSet.has(id),
  );
  if (orphanIds.length === 0) return [];
  return db.userProfile.findMany({
    where: { id: { in: orphanIds } },
    select: { id: true, email: true },
    orderBy: { email: "asc" },
  });
}

export async function applyDataReset(
  db: PrismaClient,
  selection: DataResetSelection,
  confirmPhrase: string,
  actor: { userId: string; email: string | null },
): Promise<{ preview: DataResetPreview; purgePlan?: PurgePlan }> {
  if (confirmPhrase.trim() !== DATA_RESET_CONFIRM_PHRASE) {
    throw new PurgeSafetyError(
      `พิมพ์ข้อความยืนยันให้ตรงกัน: ${DATA_RESET_CONFIRM_PHRASE}`,
    );
  }

  const preview = await previewDataReset(db, selection);

  // Catalog first (subscriptions Restrict product/plan).
  await deleteCatalog(db, preview);

  if (selection.selectAll) {
    const keepEmails = preview.keptSuperAdminEmails;
    const { plan } = await purgeData(db, {
      keepEmails,
      keepOrganizationCodes: [PROTECTED_ORG_CODE],
      allowProduction: true,
    });
    await purgeHrForOrganizations(
      db,
      plan.organizations.map((org) => org.id),
    );
    await writeAudit(db, actor, preview);
    return { preview, purgePlan: plan };
  }

  if (preview.organizations.length > 0 || preview.branches.length > 0) {
    await deleteSelectedTenant(db, preview);
    await purgeHrForOrganizations(
      db,
      preview.organizations.map((org) => org.id),
    );
  }

  await writeAudit(db, actor, preview);
  return { preview };
}

async function deleteCatalog(
  db: PrismaClient,
  preview: DataResetPreview,
): Promise<void> {
  const productIds = preview.products.map((p) => p.id);
  const planIds = preview.plans.map((p) => p.id);
  const subscriptionIds = preview.subscriptions.map((s) => s.id);
  if (
    productIds.length === 0 &&
    planIds.length === 0 &&
    subscriptionIds.length === 0
  ) {
    return;
  }

  await db.$transaction(
    async (tx) => {
      if (subscriptionIds.length > 0) {
        await tx.subscriptionFeatureOverride.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await tx.entitlement.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await tx.subscriptionHistory.deleteMany({
          where: { subscriptionId: { in: subscriptionIds } },
        });
        await tx.subscription.deleteMany({
          where: { id: { in: subscriptionIds } },
        });
      }

      if (planIds.length > 0) {
        await tx.planVersionFeature.deleteMany({
          where: { planVersion: { planId: { in: planIds } } },
        });
        await tx.planVersion.deleteMany({
          where: { planId: { in: planIds } },
        });
        await tx.plan.deleteMany({ where: { id: { in: planIds } } });
      }

      if (productIds.length > 0) {
        await tx.organizationProductMembership.deleteMany({
          where: { productId: { in: productIds } },
        });
        await tx.entitlement.deleteMany({
          where: { productId: { in: productIds } },
        });
        await tx.planVersionFeature.deleteMany({
          where: { feature: { productId: { in: productIds } } },
        });
        await tx.subscriptionFeatureOverride.deleteMany({
          where: { feature: { productId: { in: productIds } } },
        });
        await tx.feature.deleteMany({
          where: { productId: { in: productIds } },
        });
        // Remaining plans under product (if any) — versions already cleared when in planIds.
        const leftoverPlans = await tx.plan.findMany({
          where: { productId: { in: productIds } },
          select: { id: true },
        });
        const leftoverPlanIds = leftoverPlans.map((p) => p.id);
        if (leftoverPlanIds.length > 0) {
          await tx.planVersionFeature.deleteMany({
            where: { planVersion: { planId: { in: leftoverPlanIds } } },
          });
          await tx.planVersion.deleteMany({
            where: { planId: { in: leftoverPlanIds } },
          });
          await tx.plan.deleteMany({ where: { id: { in: leftoverPlanIds } } });
        }
        await tx.product.deleteMany({ where: { id: { in: productIds } } });
      }
    },
    { timeout: 120_000 },
  );
}

async function deleteSelectedTenant(
  db: PrismaClient,
  preview: DataResetPreview,
): Promise<void> {
  const organizationIds = preview.organizations.map((org) => org.id);
  const branchIds = preview.branches.map((branch) => branch.id);
  const profileIds = preview.orphanProfiles.map((profile) => profile.id);
  const orgFilter = { organizationId: { in: organizationIds } };

  await db.$transaction(
    async (tx) => {
      if (branchIds.length > 0) {
        await tx.organizationMembershipBranchScope.deleteMany({
          where: { branchId: { in: branchIds } },
        });
        await tx.userPreference.updateMany({
          where: { lastBranchId: { in: branchIds } },
          data: { lastBranchId: null },
        });
        await tx.branch.deleteMany({ where: { id: { in: branchIds } } });
      }

      if (organizationIds.length === 0) return;

      await tx.paymentAllocation.deleteMany({
        where: { OR: [{ payment: orgFilter }, { invoice: orgFilter }] },
      });
      await tx.invoiceItem.deleteMany({ where: { invoice: orgFilter } });
      await tx.invoice.deleteMany({ where: orgFilter });
      await tx.payment.deleteMany({ where: orgFilter });
      await tx.creditTransaction.deleteMany({ where: orgFilter });
      await tx.billingContact.deleteMany({ where: orgFilter });
      await tx.billingAccount.deleteMany({ where: orgFilter });
      await tx.userInvitation.deleteMany({ where: orgFilter });
      await tx.entitlement.deleteMany({ where: orgFilter });
      await tx.subscriptionFeatureOverride.deleteMany({
        where: { subscription: orgFilter },
      });
      await tx.subscriptionHistory.deleteMany({ where: orgFilter });
      await tx.subscription.deleteMany({ where: orgFilter });
      await tx.organizationProductMembership.deleteMany({ where: orgFilter });
      await tx.organizationMembershipRole.deleteMany({
        where: { membership: orgFilter },
      });
      await tx.organizationMembershipBranchScope.deleteMany({
        where: { membership: orgFilter },
      });
      await tx.organizationMembership.deleteMany({ where: orgFilter });
      await tx.organizationRolePermission.deleteMany({
        where: {
          organizationRole: { organizationId: { in: organizationIds } },
        },
      });
      await tx.organizationRole.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await tx.branch.deleteMany({ where: orgFilter });
      await tx.staffOrganizationAssignment.deleteMany({ where: orgFilter });
      await tx.organizationOnboarding.deleteMany({ where: orgFilter });
      await tx.legacyIdentityMapping.deleteMany({ where: orgFilter });
      await tx.auditLog.deleteMany({ where: orgFilter });
      await tx.outboxEvent.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await tx.userPreference.updateMany({
        where: { lastOrganizationId: { in: organizationIds } },
        data: { lastOrganizationId: null, lastBranchId: null },
      });
      await tx.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });

      if (profileIds.length > 0) {
        const resetTable = await tx.$queryRaw<{ present: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'platform' AND table_name = 'user_password_resets'
          ) AS "present"`;
        if (resetTable[0]?.present) {
          await tx.userPasswordReset.deleteMany({
            where: { userProfileId: { in: profileIds } },
          });
        }
        await tx.platformRoleAssignment.deleteMany({
          where: { userProfileId: { in: profileIds } },
        });
        await tx.userPreference.deleteMany({
          where: { userProfileId: { in: profileIds } },
        });
        await tx.userProfile.deleteMany({ where: { id: { in: profileIds } } });
      }
    },
    { timeout: 120_000 },
  );
}

/** Best-effort HR wipe by organization_id when schema `hr` exists. */
export async function purgeHrForOrganizations(
  db: PrismaClient,
  organizationIds: string[],
): Promise<void> {
  if (organizationIds.length === 0) return;
  try {
    const present = await db.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'hr'
      ) AS "present"`;
    if (!present[0]?.present) return;

    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT c.table_name::text AS "table_name"
      FROM information_schema.columns c
      WHERE c.table_schema = 'hr'
        AND c.column_name = 'organization_id'
      ORDER BY c.table_name::text`;

    const priority = [
      "notification",
      "payslip",
      "payroll_run_item",
      "payroll_run",
      "leave_balance_transaction",
      "employee_leave_balance",
      "leave_request",
      "overtime_request",
      "shift_mismatch_request",
      "attendance_adjustment",
      "attendance_event",
      "attendance_day",
      "shift_assignment",
      "employee_branch_assignment",
      "employee_recurring_pay_item",
      "schedule_period",
      "holiday",
      "employee",
      "leave_policy",
      "leave_type",
      "work_calendar",
      "payroll_schedule",
      "overtime_rule",
      "shift",
      "work_location",
      "position",
      "department",
    ];
    const ordered = [
      ...priority.filter((name) => tables.some((t) => t.table_name === name)),
      ...tables
        .map((t) => t.table_name)
        .filter((name) => !priority.includes(name)),
    ];

    for (const table of ordered) {
      if (!/^[a-z][a-z0-9_]*$/.test(table)) continue;
      try {
        await db.$executeRawUnsafe(
          `DELETE FROM hr.${table} WHERE organization_id = ANY($1::uuid[])`,
          organizationIds,
        );
      } catch (error) {
        console.warn(`[data-reset] skip hr.${table}`, error);
      }
    }
  } catch (error) {
    console.warn("[data-reset] HR purge skipped", error);
  }
}

async function writeAudit(
  db: PrismaClient,
  actor: { userId: string; email: string | null },
  preview: DataResetPreview,
): Promise<void> {
  try {
    const action = await db.auditActionType.upsert({
      where: { code: "DATA_RESET" },
      create: {
        code: "DATA_RESET",
        nameTh: "ล้างข้อมูลเริ่มต้นใหม่",
        nameEn: "DATA_RESET",
        sortOrder: 200,
        isActive: true,
        isSystem: true,
      },
      update: {},
      select: { id: true },
    });
    await db.auditLog.create({
      data: {
        actorAuthUserId: actor.userId,
        actionTypeId: action.id,
        entityType: "data_reset",
        entityId: preview.mode,
        afterJson: {
          mode: preview.mode,
          organizations: preview.organizations.map((o) => o.customerCode),
          branches: preview.branches.map(
            (b) => `${b.organizationCode}/${b.code}`,
          ),
          products: preview.products.map((p) => p.code),
          plans: preview.plans.map((p) => `${p.productCode}/${p.code}`),
          subscriptions: preview.subscriptions.map(
            (s) => `${s.organizationCode}:${s.productCode}/${s.planCode}`,
          ),
          orphanProfiles: preview.orphanProfiles.map((p) => p.email),
          actorEmail: actor.email,
        },
      },
    });
  } catch {
    // Audit is best-effort.
  }
}
