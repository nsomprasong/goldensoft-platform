import type { PrismaClient } from "@prisma/client";

export type MasterTableName =
  | "userProfileStatus"
  | "platformRole"
  | "assignmentStatus"
  | "organizationStatus"
  | "branchStatus"
  | "membershipStatus"
  | "organizationRole"
  | "branchScopeType"
  | "productStatus"
  | "featureStatus"
  | "planStatus"
  | "planVersionStatus"
  | "billingCycle"
  | "subscriptionStatus"
  | "subscriptionOverrideType"
  | "productMembershipStatus"
  | "outboxEventStatus"
  | "idempotencyStatus"
  | "legacyMigrationStatus"
  | "featureValueType"
  | "auditActionType"
  | "userInvitationStatus";

type MasterRow = {
  id: string;
  code: string;
  nameTh: string;
  nameEn: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

type DbLike = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

type MasterDelegate = {
  findUnique: (args: {
    where: { id?: string; code?: string };
  }) => Promise<MasterRow | null>;
  findFirst?: (args: {
    where: { code: string; organizationId?: null };
  }) => Promise<MasterRow | null>;
  update: (args: {
    where: { id: string };
    data: Partial<{
      nameTh: string;
      nameEn: string;
      description: string | null;
      sortOrder: number;
      isActive: boolean;
      code: string;
    }>;
  }) => Promise<MasterRow>;
  delete: (args: { where: { id: string } }) => Promise<MasterRow>;
};

function delegate(db: DbLike, table: MasterTableName): MasterDelegate {
  return (db as PrismaClient)[table] as unknown as MasterDelegate;
}

export async function getMasterByCode(
  db: DbLike,
  table: MasterTableName,
  code: string,
): Promise<MasterRow | null> {
  const masterDelegate = delegate(db, table);
  const row = table === "organizationRole" && masterDelegate.findFirst
    ? await masterDelegate.findFirst({ where: { code, organizationId: null } })
    : await masterDelegate.findUnique({ where: { code } });
  return row;
}

/** Resolve master id for new writes — fails if missing or inactive. */
export async function requireActiveMasterId(
  db: DbLike,
  table: MasterTableName,
  code: string,
): Promise<string> {
  const row = await getMasterByCode(db, table, code);
  if (!row) {
    throw new Error(`Master ${table}.${code} not found`);
  }
  if (!row.isActive) {
    throw new Error(`Master ${table}.${code} is inactive and cannot be used for new records`);
  }
  return row.id;
}

export async function countMasterReferences(
  db: PrismaClient,
  table: MasterTableName,
  masterId: string,
): Promise<number> {
  switch (table) {
    case "userProfileStatus":
      return db.userProfile.count({ where: { statusId: masterId } });
    case "platformRole":
      return db.platformRoleAssignment.count({ where: { roleId: masterId } });
    case "assignmentStatus":
      return (
        (await db.platformRoleAssignment.count({ where: { statusId: masterId } })) +
        (await db.organizationMembershipRole.count({ where: { statusId: masterId } })) +
        (await db.organizationMembershipBranchScope.count({ where: { statusId: masterId } })) +
        (await db.subscriptionFeatureOverride.count({ where: { statusId: masterId } }))
      );
    case "organizationStatus":
      return db.organization.count({ where: { statusId: masterId } });
    case "branchStatus":
      return db.branch.count({ where: { statusId: masterId } });
    case "membershipStatus":
      return db.organizationMembership.count({ where: { statusId: masterId } });
    case "organizationRole":
      return (
        (await db.organizationMembershipRole.count({ where: { roleId: masterId } })) +
        (await db.userInvitation.count({ where: { organizationRoleId: masterId } }))
      );
    case "branchScopeType":
      return (
        (await db.organizationMembershipBranchScope.count({
          where: { scopeTypeId: masterId },
        })) +
        (await db.userInvitation.count({ where: { branchScopeTypeId: masterId } }))
      );
    case "productStatus":
      return db.product.count({ where: { statusId: masterId } });
    case "featureStatus":
      return db.feature.count({ where: { statusId: masterId } });
    case "planStatus":
      return db.plan.count({ where: { statusId: masterId } });
    case "planVersionStatus":
      return db.planVersion.count({ where: { statusId: masterId } });
    case "billingCycle":
      return (
        (await db.planVersion.count({ where: { billingCycleDefaultId: masterId } })) +
        (await db.subscription.count({ where: { billingCycleId: masterId } }))
      );
    case "subscriptionStatus":
      return db.subscription.count({ where: { statusId: masterId } });
    case "subscriptionOverrideType":
      return db.subscriptionFeatureOverride.count({ where: { overrideTypeId: masterId } });
    case "productMembershipStatus":
      return db.organizationProductMembership.count({ where: { statusId: masterId } });
    case "outboxEventStatus":
      return db.outboxEvent.count({ where: { statusId: masterId } });
    case "idempotencyStatus":
      return db.idempotencyKey.count({ where: { statusId: masterId } });
    case "legacyMigrationStatus":
      return db.legacyIdentityMapping.count({ where: { migrationStatusId: masterId } });
    case "featureValueType":
      return db.planVersionFeature.count({ where: { valueTypeId: masterId } });
    case "auditActionType":
      return db.auditLog.count({ where: { actionTypeId: masterId } });
    case "userInvitationStatus":
      return db.userInvitation.count({ where: { statusId: masterId } });
    default:
      return 0;
  }
}

export async function updateMasterMetadata(
  db: PrismaClient,
  table: MasterTableName,
  id: string,
  input: {
    nameTh?: string;
    nameEn?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    code?: string;
  },
): Promise<MasterRow> {
  const current = await delegate(db, table).findUnique({ where: { id } });
  if (!current) throw new Error("Master row not found");

  if (input.code !== undefined && input.code !== current.code) {
    const refs = await countMasterReferences(db, table, id);
    if (refs > 0) {
      throw new Error("Cannot change master code when it is already referenced");
    }
  }

  return delegate(db, table).update({
    where: { id },
    data: {
      nameTh: input.nameTh,
      nameEn: input.nameEn,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      code: input.code,
    },
  });
}

export async function deactivateMaster(
  db: PrismaClient,
  table: MasterTableName,
  id: string,
): Promise<MasterRow> {
  const current = await delegate(db, table).findUnique({ where: { id } });
  if (!current) throw new Error("Master row not found");
  return delegate(db, table).update({
    where: { id },
    data: { isActive: false },
  });
}

export async function deleteMasterIfAllowed(
  db: PrismaClient,
  table: MasterTableName,
  id: string,
): Promise<void> {
  const current = await delegate(db, table).findUnique({ where: { id } });
  if (!current) throw new Error("Master row not found");
  if (current.isSystem) {
    throw new Error("Cannot delete system master rows");
  }
  const refs = await countMasterReferences(db, table, id);
  if (refs > 0) {
    throw new Error("Cannot hard-delete master rows that are referenced");
  }
  await delegate(db, table).delete({ where: { id } });
}
