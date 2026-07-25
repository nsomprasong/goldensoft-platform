# ADR-001 — Central Auth and Tenancy

## 1. Status

**ACCEPTED** — Phase 1B freeze

วันที่: 2026-07-25  
อ้างอิง: `docs/CENTRAL_AUTH_FOUNDATION.md`

---

## 2. Context

GoldenSoft Platform จะเป็นเจ้าของ Central Auth, User Identity, Organization, Branch, Membership, Subscription และ Entitlement  
ผลิตภัณฑ์ Resident V2, HR และ QR Station ใช้ Supabase Auth กลางชุดเดียวและ UUID เดียวกัน  
Legacy Resident ยังใช้ Auth เดิม — อ่านเพื่ออ้างอิง/export เท่านั้น ห้ามแก้และห้าม FK ข้ามฐานข้อมูล

เอกสารนี้แช่แข็งการตัดสินใจสถาปัตยกรรมก่อนเขียนโค้ด schema หรือแอป

---

## 3. Decisions D001–D012

### D001 — Active Organization และ Branch

- ผู้ใช้หนึ่งคนเป็นสมาชิกได้หลาย Organization
- ระหว่างใช้งานต้องมี `activeOrganizationId` หนึ่งค่า
- `activeBranchId` เป็น nullable; `null` = ทุกสาขาที่ผู้ใช้ได้รับสิทธิ์
- Supabase JWT ใช้ยืนยันตัวผู้ใช้เป็นหลัก (`sub`)
- Organization/Branch context ต้องผ่านการตรวจสอบฝั่ง Server
- ห้ามเชื่อ `organizationId` หรือ `branchId` จาก Client โดยตรง

### D002 — Session และหลายอุปกรณ์

- อนุญาตให้ล็อกอินหลายอุปกรณ์พร้อมกัน
- ต้องมี `sessionEpoch` / `sessionVersion` เพื่อสั่งออกจากระบบทุกอุปกรณ์เมื่อจำเป็น
- การเปลี่ยนรหัสผ่าน การปิดผู้ใช้ หรือเหตุด้านความปลอดภัยต้องเพิ่ม Epoch
- Payroll และข้อมูลสำคัญต้องรองรับ Re-authentication ในอนาคต

### D003 — ขอบเขต RBAC

**Platform เป็นเจ้าของ:** Platform roles, Organization membership, Product membership, Subscription, Entitlement  

**แต่ละ Product เป็นเจ้าของ:** Product role, Product permission, Branch scope, Operational authorization  

ห้ามใช้ Role ชุดเดียวควบคุมทุกโปรแกรม

### D004 — Organization และ Branch Ownership

- Platform เป็น Source of Truth ของ Organization และ Branch
- แต่ละ Product อ้างอิงด้วย `organizationId` และ `branchId`
- ห้าม Product สร้าง Organization เอง
- เมื่อเปิด Subscription ใช้ Idempotent Provisioning
- รองรับ Outbox Event เพื่อแยก Project ในอนาคต

### D005 — การสร้าง Auth User

- เฉพาะ Central Platform เท่านั้นที่สร้างหรือเชิญ Auth User
- Product App ห้ามเรียก Supabase Admin API เพื่อสร้างผู้ใช้เอง
- Product App ต้องส่งคำขอไป Platform API
- Employee สามารถมีข้อมูลได้โดยยังไม่มี Auth User
- สร้าง Auth User เมื่อได้รับสิทธิ์เข้าใช้งานระบบ

### D006 — Permission Namespace

รูปแบบมาตรฐาน: `product.resource.action`

ตัวอย่าง:

- `platform.organization.read`
- `platform.subscription.manage`
- `resident.booking.create`
- `resident.payment.approve`
- `hr.employee.read`
- `hr.payroll.approve`
- `qrstation.transaction.read`

### D007 — QR Station Identity

- ผู้ใช้งานบุคคลใช้ Central Auth
- เครื่อง/อุปกรณ์ห้ามสร้างเป็น Supabase Auth User
- อุปกรณ์ใช้ Device ID, Secret หรือ Certificate แยก
- Device Credential ต้องหมุนเวียนและเพิกถอนได้

### D008 — Supabase Project และ Schema

ช่วงเริ่มต้น: Supabase Project ใหม่หนึ่งโปรเจกต์ แยก schema:

| Schema | เจ้าของ |
|--------|---------|
| `auth` | Supabase (Central Auth) |
| `platform` | GoldenSoft Platform |
| `resident_v2` | Resident V2 |
| `hr` | HR |
| `qrstation` | QR Station |

แต่ละ Repository เป็นเจ้าของ Migration ของ schema ตัวเอง และห้ามแก้ schema อื่น

### D009 — Legacy Mapping

สร้าง mapping ด้วยฟิลด์:

- `legacyAuthUserId`
- `centralAuthUserId`
- `legacyEmployeeId`
- `newEmployeeId`
- `organizationId`
- `migrationStatus`

ห้ามสร้าง Foreign Key ไปฐานข้อมูล Legacy  
Legacy ใช้อ่านเพื่อ Export เท่านั้น

### D010 — Subscription Model

- หนึ่ง Organization ซื้อได้หลาย Product
- หนึ่ง Product มี Plan และ Add-on
- Subscription แยกตาม Organization และ Product
- สถานะที่รองรับ: รายเดือน, รายปี, ทดลองใช้, ระงับ, ยกเลิก
- เริ่มจาก Manual Billing ก่อน
- ออกแบบให้เพิ่ม Automated Billing ได้ภายหลัง

### D011 — Role Levels

**Platform roles:** `SUPER_ADMIN`, `SUPPORT`, `BILLING_ADMIN`  

**Organization roles:** `OWNER`, `ADMIN`, `BILLING_CONTACT`  

**Product roles:** แยกอยู่ในแต่ละ Product  

`SUPPORT` ห้ามเข้าดู Payroll หรือข้อมูลสำคัญโดยอัตโนมัติ — ต้องมี Audit และการอนุมัติ

### D012 — Organization Slug

- ใช้ UUID เป็น Primary Key
- `organization.slug` ไม่ซ้ำทั้งระบบ
- Branch code ไม่ซ้ำภายใน Organization
- Slug ใช้สำหรับ URL และการแสดงผล — ไม่ใช้เป็น Foreign Key
- หากเปลี่ยน Slug ในอนาคตต้องรองรับ Alias หรือ Redirect

---

## 4. Security Invariants

1. Service Role Key ห้ามอยู่ใน Browser
2. ทุก API ต้องตรวจ Auth, Organization, Product และ Permission
3. ทุก Business Record ต้องมี `organizationId`
4. ข้อมูลที่เกี่ยวกับสาขาต้องมี `branchId`
5. Client ห้ามกำหนดสิทธิ์ของตัวเอง
6. Product หนึ่งห้ามแก้ Schema ของ Product อื่น
7. Legacy Database เป็น Read-only
8. ทุกการเปลี่ยนสิทธิ์และ Subscription ต้องมี Audit Log
9. Payroll และข้อมูลส่วนบุคคลต้องมีสิทธิ์เฉพาะ
10. การ Provision และ Migration ต้อง Idempotent

---

## 5. Consequences

**ได้**

- แยก Identity กลางออกจาก Employee/Domain ของแต่ละ Product
- Multi-tenant ชัดเจน (Organization + Branch)
- Product ขยาย RBAC ได้โดยไม่ปนกับ Platform
- เตรียมแยก Supabase Project ภายหลังผ่าน Outbox ได้
- Legacy migration เป็น mapping ไม่ผูก schema ข้ามระบบ

**ต้องทำตาม**

- Product ทุกตัวเรียก Platform สำหรับ invite/create user และ org/branch truth
- Server ทุกชั้นต้อง resolve และตรวจ active org/branch เอง
- Permission code ต้องใช้ namespace ตาม D006
- Device ของ QR Station ไม่อยู่ใน `auth.users`

**เลิกทำ**

- คัดลอกโมเดล Employee = Auth principal ทั้งระบบแบบ Legacy
- Role ชุดเดียวคุมทุกโปรแกรม
- Product สร้าง Organization หรือ Auth User เอง

---

## 6. Deferred Decisions

ยังไม่แช่แข็งใน ADR นี้ — ตัดสินใจก่อน implement ที่เกี่ยวข้อง:

1. ที่เก็บ `activeOrganizationId` / `activeBranchId` (cookie, preference table, หรืออื่น)
2. รูปแบบ Re-authentication สำหรับ Payroll (step-up อย่างไร, TTL)
3. รายละเอียด Device Credential ของ QR Station (secret vs certificate, rotation interval)
4. โครงสร้าง Outbox Event และ consumer ต่อ Product
5. Catalog ของ Plan / Add-on และกฎ Entitlement รายฟีเจอร์
6. กลไก Approve ให้ SUPPORT เข้าถึงข้อมูลสำคัญชั่วคราว
7. กลยุทธ์ Alias/Redirect เมื่อเปลี่ยน Organization Slug
8. ช่วงเวลาและเครื่องมือ Export จาก Legacy สู่ mapping table

---

## 7. Criteria for Revisiting This ADR

ทบทวน ADR นี้เมื่อเกิดอย่างน้อยหนึ่งข้อ:

1. ต้องแยก Supabase Project ต่อ Product ก่อนที่ Outbox/schema แยกจะรองรับได้
2. ข้อกำหนด compliance บังคับ single-device session หรือห้าม multi-device
3. Product ต้องการสร้าง Organization นอก Platform (เช่น white-label ภายนอก)
4. Permission namespace ชนกับมาตรฐานภายนอกที่ต้องรองรับ
5. Device identity ของ QR Station ต้องรวมเข้า Auth provider
6. Billing อัตโนมัติบังคับเปลี่ยน Subscription model อย่างมีนัยสำคัญ
7. การย้าย Legacy ต้องการ reuse UUID แบบที่ขัดกับ D009

การทบทวนต้องออก ADR ใหม่หรือแก้สถานะเอกสารนี้เป็น Superseded พร้อมเหตุผล — ห้ามเปลี่ยนเงียบ ๆ ในโค้ดอย่างเดียว
)
