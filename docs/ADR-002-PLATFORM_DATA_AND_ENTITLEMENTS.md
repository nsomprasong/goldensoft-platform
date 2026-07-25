# ADR-002 — Platform Data and Entitlements

## 1. Status

**ACCEPTED** — Phase 1D  

วันที่: 2026-07-25  
อ้างอิง: `ADR-001-CENTRAL_AUTH_AND_TENANCY.md`, `PLATFORM_DATABASE_BLUEPRINT.md`  
ปิด Open Questions ของ Blueprint ข้อ 1–8 ที่เกี่ยวข้องกับข้อมูลและ Entitlement

---

## 2. Context

Phase 1C ทิ้งคำถามเปิดเรื่อง active org/branch, รูปแบบ snapshot, add-on, usage limits, FK ไป `auth.users`, retention, OWNER bootstrap และ entitlement cache  

ADR นี้แช่แข็งคำตอบก่อนสร้าง Prisma/SQL เพื่อให้ schema `platform` และกฎฝั่ง Product สอดคล้องกัน โดยไม่แก้เอกสารเดิมในรอบนี้

---

## 3. Decisions D101–D108

### D101 — Active Organization และ Branch

- สร้าง `user_preferences` ใน Platform สำหรับค่าที่ใช้ล่าสุด: `lastOrganizationId`, `lastBranchId` (nullable)
- Context ที่ใช้งานจริงอยู่ใน **Signed HTTP-only Cookie** เก็บเฉพาะ ID ไม่ใช่ความลับ
- ทุก request ตรวจ Membership และ Branch Scope ฝั่ง Server
- ห้ามเชื่อ org/branch จาก Client โดยไม่ตรวจ; ห้ามฝัง active org/branch เป็นสิทธิ์ถาวรใน Supabase JWT
- `branchId = null` = ทุกสาขาที่**ผู้ใช้มีสิทธิ์** — ไม่ใช่ทุกสาขาของ Organization โดยอัตโนมัติ

### D102 — Subscription Snapshot

Subscription เก็บ **Immutable Snapshot (JSONB)** อย่างน้อย:

`schemaVersion`, `productCode`, `planCode`, `planVersion`, `planName`, `currency`, `billingCycle`, `basePrice`, `featureCodes`, `limits`, `capturedAt`

ตัวอย่าง `limits`: `maxUsers`, `maxEmployees`, `maxBranches`, `maxRooms`, `maxStations`, `maxDevices`

หลัง Subscription เริ่มใช้งาน ห้ามแก้ snapshot ย้อนหลัง  
เปลี่ยนแพ็กเกจ = สร้าง Subscription Revision หรือรอบใหม่ที่ตรวจสอบย้อนหลังได้

### D103 — Add-on และ Override

- Add-on ที่ขายจริงออกแบบเป็น `subscription_items`
- Subscription หนึ่งรายการมี Base Plan หนึ่งรายการ + Add-on ได้หลายรายการ
- Feature Override ใช้เฉพาะสิทธิ์พิเศษ / โปรโมชั่นชั่วคราว / แก้ปัญหาลูกค้า
- Override ต้องมีเหตุผล ผู้อนุมัติ วันเริ่ม วันหมดอายุ — ห้ามใช้แทน Product Catalog ระยะยาว
- `subscription_items` อาจเลื่อนหลัง MVP แต่**ต้องสงวนโครงสร้าง**ตอน implement schema

### D104 — Usage Limits

- Limit เป็นส่วนของ Entitlement Snapshot; Platform = Source of Truth
- Product App ตรวจ Limit ก่อนสร้างข้อมูล; Usage Count คำนวณจาก Product DB ได้
- ห้ามใช้ค่าที่ Client ส่งมาเป็น Usage Count
- MVP = **Hard Limit** ก่อน; Grace Period และ Overage Billing เลื่อนไปภายหลัง

### D105 — Auth User Reference

- `platform.user_profiles.auth_user_id` → FK ไป `auth.users.id` (project เดียว, Platform เจ้าของ Central Auth)
- `resident_v2` / `hr` / `qrstation` เก็บ `auth_user_id` เป็น **UUID Soft Reference** เท่านั้น
- Product Schema ห้าม FK ไป `auth.users` หรือ `platform`
- Product ตรวจผู้ใช้ผ่าน Platform API + Application Context
- ต้องรองรับการแยก Product ไป Supabase Project ใหม่ในอนาคต

### D106 — Retention

| ข้อมูล | นโยบายเริ่มต้น |
|--------|----------------|
| Platform Audit Log | ≥ 7 ปี |
| Security / Permission Audit | ห้ามแก้หรือลบผ่านแอปปกติ |
| Outbox สำเร็จ | ≥ 30 วัน |
| Outbox ล้มเหลว | ≥ 90 วัน |
| Outbox ยังไม่สำเร็จ | ห้ามลบ |

ปรับได้ตามกฎหมาย/สัญญา · **Archive ก่อน Delete**

### D107 — Organization OWNER Bootstrap

สร้าง Organization ใน **Transaction เดียว** ผ่าน Platform Service + Idempotency Key:

1. สร้าง Organization  
2. สร้าง Branch เริ่มต้น (ถ้ามี)  
3. สร้าง Organization Membership  
4. กำหนด Role `OWNER`  
5. สร้าง Audit Log  
6. สร้าง Outbox Event  

ล้มเหลวขั้นใด = Rollback ทั้งก้อน  
Organization ต้องมี OWNER ที่ Active ≥ 1 คน · ถอด OWNER คนสุดท้ายต้องถูกปฏิเสธ

### D108 — Entitlement Cache

- Product cache Entitlement ได้ **ไม่เกิน 5 นาที**
- Platform ส่ง Outbox เมื่อ Subscription / Membership / Entitlement เปลี่ยน → Product ล้าง cache
- งานทั่วไปใช้ cache 5 นาที
- งานสำคัญใช้ Live Check หรือ cache ≤ **60 วินาที**: payroll approval, billing changes, role/permission changes, sensitive HR data, QR Station settlement
- Platform ติดต่อไม่ได้: read-only ใช้ cache ที่ยังไม่หมดอายุได้ · privileged write = **Fail Closed**
- ห้ามอนุญาตสิทธิ์จาก cache ที่หมดอายุ

---

## 4. Required Schema Adjustments

ขั้นสร้าง Schema (ยังไม่แก้ Blueprint ในงานนี้) ต้องมีหรือพิจารณา:

| รายการ | ข้อกำหนด |
|--------|----------|
| `user_preferences` | `user_profile_id`, `last_organization_id?`, `last_branch_id?`, timestamps; unique ต่อ user |
| `subscription_items` | สงวนโครงสร้าง Base Plan + Add-ons; implement ได้หลัง MVP |
| Immutable subscription snapshot | คอลัมน์ JSONB ตาม D102; ห้าม update หลัง activate |
| Usage limits ใน snapshot | อยู่ใน `limits` ของ entitlement/subscription snapshot |
| Retention metadata | นโยบาย/คอลัมน์ช่วย archive (เช่น `archived_at`) ตาม D106 |
| OWNER-last-member | enforce ใน Service Layer + automated tests (ไม่พึ่ง DB constraint อย่างเดียวก็ได้) |
| Override fields | `reason`, `approved_by`, `starts_at`, `ends_at` ตาม D103 |

---

## 5. Security Consequences

- Active context ใน cookie/preferences ไม่ใช่ authorization — Server ตรวจ membership/scope ทุกครั้ง
- Soft reference ใน Product บังคับให้ trust boundary อยู่ที่ Platform API
- Fail closed เมื่อ cache หมดอายุหรือ Platform ลง สำหรับ privileged write
- Audit ความปลอดภัยห้ามลบผ่านแอปปกติ
- Client ห้ามเป็นแหล่ง usage count หรือ org/branch authority

---

## 6. Operational Consequences

- Org bootstrap ต้องเป็น transactional Platform service พร้อม idempotency
- Product ต้องมี outbox consumer สำหรับ invalidate entitlement cache
- Retention job: archive ก่อน delete; แยก retention ต่อประเภท event
- เปลี่ยนแพ็กเกจสร้าง revision/รอบใหม่ — ห้ามแก้ snapshot เดิม
- Hard limit ใน MVP อาจบล็อกการสร้างข้อมูลเมื่อถึงเพดาน — Product ต้องแสดงข้อผิดพลาดชัด

---

## 7. Deferred Work

1. Implement เต็มรูปแบบของ `subscription_items` (หลัง MVP ได้ หากสงวน schema)
2. Grace Period และ Overage Billing
3. Automated Payment Gateway / Coupon / Tax Invoice (ตาม Blueprint Deferred)
4. Support access grant สำหรับ SUPPORT + sensitive data
5. QR Device Credential
6. Organization slug aliases
7. Re-authentication step-up สำหรับ Payroll (ยังค้างจาก ADR-001)
8. รายละเอียด Outbox consumer contract ต่อ Product
9. เครื่องมือ Export Legacy → `legacy_identity_mappings`

---

## 8. Acceptance Checklist

- [x] D101–D108 บันทึกครบและสอดคล้อง ADR-001
- [x] ปิด Open Questions ของ Blueprint ข้อ 1–8 ในขอบเขตข้อมูล/entitlement
- [x] Required Schema Adjustments ระบุสำหรับขั้น Implementation
- [x] Cache TTL, fail-closed และ live-check งานสำคัญชัดเจน
- [x] OWNER bootstrap transactional + last-OWNER guard
- [x] ไม่แก้เอกสารเดิม · ไม่มี SQL/Prisma ใน ADR นี้
- [ ] ขั้นถัดไป (นอกงานนี้): อัปเดต Blueprint หรือสร้าง Prisma ตาม ADR-001/002 เมื่อได้รับอนุมัติ
)
