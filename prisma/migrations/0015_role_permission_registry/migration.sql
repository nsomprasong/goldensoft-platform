-- Additive draft only. Do not apply without explicit approval.
CREATE TABLE "platform"."role_types" (
  "id" UUID NOT NULL, "code" TEXT NOT NULL, "name_th" TEXT NOT NULL,
  "name_en" TEXT NOT NULL, "description" TEXT, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "is_system" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_types_pkey" PRIMARY KEY ("id"), CONSTRAINT "role_types_code_key" UNIQUE ("code")
);
CREATE TABLE "platform"."role_statuses" (
  "id" UUID NOT NULL, "code" TEXT NOT NULL, "name_th" TEXT NOT NULL,
  "name_en" TEXT NOT NULL, "description" TEXT, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "is_system" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_statuses_pkey" PRIMARY KEY ("id"), CONSTRAINT "role_statuses_code_key" UNIQUE ("code")
);
CREATE TABLE "platform"."permission_actions" (
  "id" UUID NOT NULL, "code" TEXT NOT NULL, "name_th" TEXT NOT NULL,
  "name_en" TEXT NOT NULL, "description" TEXT, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true, "is_system" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permission_actions_pkey" PRIMARY KEY ("id"), CONSTRAINT "permission_actions_code_key" UNIQUE ("code")
);
ALTER TABLE "platform"."platform_roles" ADD COLUMN "role_type_id" UUID, ADD COLUMN "role_status_id" UUID;
ALTER TABLE "platform"."organization_roles" ADD COLUMN "role_type_id" UUID, ADD COLUMN "role_status_id" UUID;
ALTER TABLE "platform"."permissions"
  ADD COLUMN "feature_code" TEXT, ADD COLUMN "menu_code" TEXT, ADD COLUMN "menu_name_th" TEXT,
  ADD COLUMN "menu_category_th" TEXT, ADD COLUMN "route_path" TEXT,
  ADD COLUMN "is_navigation" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "parent_menu_code" TEXT, ADD COLUMN "permission_action_id" UUID;
ALTER TABLE "platform"."platform_roles" ADD CONSTRAINT "platform_roles_role_type_id_fkey" FOREIGN KEY ("role_type_id") REFERENCES "platform"."role_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform"."platform_roles" ADD CONSTRAINT "platform_roles_role_status_id_fkey" FOREIGN KEY ("role_status_id") REFERENCES "platform"."role_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform"."organization_roles" ADD CONSTRAINT "organization_roles_role_type_id_fkey" FOREIGN KEY ("role_type_id") REFERENCES "platform"."role_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform"."organization_roles" ADD CONSTRAINT "organization_roles_role_status_id_fkey" FOREIGN KEY ("role_status_id") REFERENCES "platform"."role_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform"."permissions" ADD CONSTRAINT "permissions_permission_action_id_fkey" FOREIGN KEY ("permission_action_id") REFERENCES "platform"."permission_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "platform_roles_role_type_id_idx" ON "platform"."platform_roles"("role_type_id");
CREATE INDEX "platform_roles_role_status_id_idx" ON "platform"."platform_roles"("role_status_id");
CREATE INDEX "organization_roles_role_type_id_idx" ON "platform"."organization_roles"("role_type_id");
CREATE INDEX "organization_roles_role_status_id_idx" ON "platform"."organization_roles"("role_status_id");
CREATE INDEX "permissions_permission_action_id_idx" ON "platform"."permissions"("permission_action_id");

INSERT INTO "platform"."role_types" ("id","code","name_th","name_en","sort_order") VALUES
  (gen_random_uuid(),'PLATFORM','บทบาทระดับแพลตฟอร์ม','Platform role',10),
  (gen_random_uuid(),'SYSTEM_STANDARD','บทบาทมาตรฐาน','System standard role',20),
  (gen_random_uuid(),'ORGANIZATION_CUSTOM','บทบาทขององค์กร','Organization custom role',30);
INSERT INTO "platform"."role_statuses" ("id","code","name_th","name_en","sort_order") VALUES
  (gen_random_uuid(),'ACTIVE','เปิดใช้งาน','Active',10),
  (gen_random_uuid(),'INACTIVE','ปิดใช้งาน','Inactive',20);
INSERT INTO "platform"."permission_actions" ("id","code","name_th","name_en","sort_order") VALUES
  (gen_random_uuid(),'read','ดูข้อมูล','Read',10), (gen_random_uuid(),'create','เพิ่มข้อมูล','Create',20),
  (gen_random_uuid(),'update','แก้ไขข้อมูล','Update',30), (gen_random_uuid(),'delete','ลบข้อมูล','Delete',40),
  (gen_random_uuid(),'manage','จัดการ','Manage',50), (gen_random_uuid(),'approve','อนุมัติ','Approve',60),
  (gen_random_uuid(),'export','ส่งออกข้อมูล','Export',70), (gen_random_uuid(),'invite','เชิญผู้ใช้งาน','Invite',80),
  (gen_random_uuid(),'reset_password','รีเซ็ตรหัสผ่าน','Reset password',90), (gen_random_uuid(),'configure','ตั้งค่าระบบ','Configure',100),
  (gen_random_uuid(),'assign','กำหนด','Assign',110), (gen_random_uuid(),'assign_privileged','กำหนดบทบาทสำคัญ','Assign privileged',120),
  (gen_random_uuid(),'calculate','คำนวณ','Calculate',130), (gen_random_uuid(),'deactivate','ปิดใช้งาน','Deactivate',140),
  (gen_random_uuid(),'link_user','เชื่อมผู้ใช้งาน','Link user',150), (gen_random_uuid(),'lock','ล็อก','Lock',160),
  (gen_random_uuid(),'mark_paid','บันทึกว่าจ่ายแล้ว','Mark paid',170), (gen_random_uuid(),'override','แก้ไขแทน','Override',180),
  (gen_random_uuid(),'publish','เผยแพร่','Publish',190), (gen_random_uuid(),'review','ตรวจสอบ','Review',200),
  (gen_random_uuid(),'self','ใช้งานข้อมูลของตนเอง','Self service',210), (gen_random_uuid(),'adjust','ปรับปรุง','Adjust',220),
  (gen_random_uuid(),'record','บันทึก','Record',230), (gen_random_uuid(),'suspend','ระงับ','Suspend',240),
  (gen_random_uuid(),'password_reset','รีเซ็ตรหัสผ่าน','Password reset',250);
UPDATE "platform"."platform_roles" SET "role_type_id"=(SELECT id FROM "platform"."role_types" WHERE code='PLATFORM'), "role_status_id"=(SELECT id FROM "platform"."role_statuses" WHERE code=CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END);
UPDATE "platform"."organization_roles" SET "role_type_id"=(SELECT id FROM "platform"."role_types" WHERE code=CASE WHEN is_system THEN 'SYSTEM_STANDARD' ELSE 'ORGANIZATION_CUSTOM' END), "role_status_id"=(SELECT id FROM "platform"."role_statuses" WHERE code=CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END);
UPDATE "platform"."permissions" p SET "permission_action_id"=a.id FROM "platform"."permission_actions" a WHERE a.code=p.action;

-- SQL-only scope/uniqueness guarantees. Apply must be preceded by duplicate checks documented in readiness notes.
ALTER TABLE "platform"."organization_roles" ADD CONSTRAINT "organization_roles_owner_scope_check"
  CHECK (("is_system" = true AND "organization_id" IS NULL) OR ("is_system" = false AND "organization_id" IS NOT NULL));
-- The system/org code indexes already exist from 0004_phase7_operations.
CREATE UNIQUE INDEX "organization_roles_org_name_th_key" ON "platform"."organization_roles"("organization_id", lower(btrim("name_th"))) WHERE "organization_id" IS NOT NULL;
