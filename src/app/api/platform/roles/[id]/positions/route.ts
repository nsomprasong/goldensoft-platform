import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadActorAccess } from "@/lib/auth/actor-access";
import { requireAuthUser } from "@/lib/auth/request-auth";
import { canManageCustomRoles } from "@/lib/platform/custom-roles";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({ organizationId: z.string().uuid(), nameTh: z.string().trim().min(1).max(200), description: z.string().trim().max(500).nullable().optional(), scope: z.enum(["ORGANIZATION", "BRANCH"]), branchId: z.string().uuid().nullable().optional() });
type Context = { params: Promise<{ id: string }> };

async function session(request: NextRequest, roleId: string) {
  const user = await requireAuthUser(request);
  if (!user) return null;
  const actor = await loadActorAccess(prisma, user.id);
  const role = await prisma.organizationRole.findFirst({ where: { id: roleId, isActive: true }, select: { id: true, organizationId: true } });
  if (!role?.organizationId || !(await canManageCustomRoles(actor, role.organizationId))) return null;
  return { user, actor, role };
}

export async function GET(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const auth = await session(request, id);
  if (!auth) return NextResponse.json({ message: "ไม่มีสิทธิ์ดูตำแหน่งของบทบาทนี้" }, { status: 403 });
  const rows = await prisma.$queryRaw<Array<{ id: string; name_th: string; branch_id: string | null; branch_name: string | null; is_system_standard: boolean; is_active: boolean; employee_count: number }>>`
    SELECT p.id::text, p.name_th, p.branch_id::text, b.name AS branch_name, p.is_system_standard, p.is_active,
      COUNT(DISTINCT e.id)::int AS employee_count
    FROM hr.position_roles pr JOIN hr.positions p ON p.id=pr.position_id
    LEFT JOIN platform.branches b ON b.id=p.branch_id LEFT JOIN hr.employees e ON e.position_id=p.id AND e.is_active=true
    WHERE pr.organization_role_id=${id}::uuid AND p.organization_id=${auth.role.organizationId}::uuid
    GROUP BY p.id,p.name_th,p.branch_id,b.name,p.is_system_standard,p.is_active ORDER BY p.is_system_standard DESC,p.branch_id NULLS FIRST,p.name_th
  `;
  return NextResponse.json({ positions: rows.map((row) => ({ id: row.id, name: row.name_th, scope: row.is_system_standard ? "ตำแหน่งมาตรฐาน" : row.branch_id ? "ใช้เฉพาะสาขา" : "ใช้ทุกสาขาในองค์กร", branchName: row.branch_name, employeeCount: Number(row.employee_count), isActive: row.is_active })) });
}

export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const auth = await session(request, id);
  if (!auth) return NextResponse.json({ message: "ไม่มีสิทธิ์เพิ่มตำแหน่ง" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.organizationId !== auth.role.organizationId) return NextResponse.json({ message: "ข้อมูลตำแหน่งไม่ถูกต้อง" }, { status: 400 });
  const branchId = parsed.data.scope === "BRANCH" ? parsed.data.branchId : null;
  if (parsed.data.scope === "BRANCH" && !branchId) return NextResponse.json({ message: "กรุณาเลือกสาขา" }, { status: 400 });
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId: auth.role.organizationId }, select: { id: true } });
    if (!branch) return NextResponse.json({ message: "ไม่พบสาขาที่เลือก" }, { status: 404 });
  }
  try {
    const position = await prisma.$transaction(async (tx) => {
      const duplicate = await tx.$queryRaw<Array<{ id: string }>>`SELECT id::text FROM hr.positions WHERE organization_id=${auth.role.organizationId}::uuid AND lower(name_th)=lower(${parsed.data.nameTh}) AND branch_id IS NOT DISTINCT FROM ${branchId}::uuid LIMIT 1`;
      if (duplicate[0]) throw new Error("DUPLICATE_POSITION_NAME");
      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO hr.positions (id,organization_id,branch_id,code,name_th,name_en,description,is_active,is_system_standard,default_role_id,created_at,updated_at)
        VALUES (gen_random_uuid(),${auth.role.organizationId}::uuid,${branchId}::uuid,'POS-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),${parsed.data.nameTh},${parsed.data.nameTh},${parsed.data.description ?? null},true,false,${id}::uuid,now(),now()) RETURNING id::text
      `;
      await tx.$executeRaw`INSERT INTO hr.position_roles (id,position_id,organization_role_id,is_primary,created_at,updated_at) VALUES (gen_random_uuid(),${ids[0].id}::uuid,${id}::uuid,true,now(),now())`;
      const action = await tx.auditActionType.upsert({ where: { code: "custom_role.update" }, update: {}, create: { code: "custom_role.update", nameTh: "แก้ไขบทบาทองค์กร", nameEn: "Update organization role", isSystem: true } });
      await tx.auditLog.create({ data: { organizationId: auth.role.organizationId, actorAuthUserId: auth.user.id, actionTypeId: action.id, entityType: "position", entityId: ids[0].id, afterJson: { nameTh: parsed.data.nameTh, branchId, organizationRoleId: id, source: "ROLE_PAGE" } } });
      return { id: ids[0].id, name: parsed.data.nameTh };
    });
    return NextResponse.json({ position }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_POSITION_NAME") return NextResponse.json({ message: "มีชื่อตำแหน่งนี้แล้วในขอบเขตที่เลือก" }, { status: 409 });
    throw error;
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const auth = await session(request, id);
  if (!auth) return NextResponse.json({ message: "ไม่มีสิทธิ์ยกเลิกการผูกตำแหน่ง" }, { status: 403 });
  const positionId = request.nextUrl.searchParams.get("positionId");
  if (!positionId) return NextResponse.json({ message: "ไม่พบตำแหน่ง" }, { status: 400 });
  const count = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM hr.employees e JOIN hr.positions p ON p.id=e.position_id WHERE p.organization_id=${auth.role.organizationId}::uuid AND e.position_id=${positionId}::uuid AND e.is_active=true`;
  await prisma.$executeRaw`DELETE FROM hr.position_roles pr USING hr.positions p WHERE pr.position_id=p.id AND p.organization_id=${auth.role.organizationId}::uuid AND pr.position_id=${positionId}::uuid AND pr.organization_role_id=${id}::uuid`;
  await prisma.$executeRaw`UPDATE hr.positions SET default_role_id=NULL,updated_at=now() WHERE id=${positionId}::uuid AND organization_id=${auth.role.organizationId}::uuid AND default_role_id=${id}::uuid`;
  return NextResponse.json({ ok: true, affectedEmployees: Number(count[0]?.count ?? 0) });
}
