# คู่มือเพิ่มองค์กร GoldenSoft และสาขาแรก

เครื่องมือ one-time / idempotent แบบ Preview + Confirm สำหรับเพิ่มองค์กรจริง
`GOLDENSOFT` และสาขา `GOLDENSOFT-01` ลงใน Platform Database

## ข้อห้าม

- ห้ามแก้ Prisma schema, seed เดิม หรือ demo organizations
- ห้ามสร้าง migration / `db push` / `migrate reset`
- ห้าม hard delete หรือแก้ทับข้อมูลเดิมโดยอัตโนมัติ
- ห้ามใช้กับ Legacy project (`invnwpyshxdadhocueeh`)
- ต้องใช้เฉพาะ project `horyhrnqbeaivdztekfv`

## ข้อมูลที่จะเพิ่ม

| รายการ | ค่า | ฟิลด์จริงใน schema |
|--------|-----|--------------------|
| องค์กร code | `GOLDENSOFT` | `organizations.customer_code` |
| องค์กร slug | `goldensoft` | `organizations.slug` |
| องค์กรชื่อไทย | `โกลเด้นซอฟต์` | `organizations.display_name` |
| องค์กรชื่ออังกฤษ | `GoldenSoft` | `organizations.legal_name` |
| องค์กรสถานะ | `ACTIVE` | `organizations.status_id` → `organization_statuses` |
| สาขา code | `GOLDENSOFT-01` | `branches.code` |
| สาขาชื่อไทย | `สาขาที่ 1` | `branches.name` |
| สาขาสถานะ | `ACTIVE` | `branches.status_id` → `branch_statuses` |

หมายเหตุ: schema ของ `Branch` มีฟิลด์ชื่อเดียว (`name`) จึงเก็บชื่อไทยเป็นชื่อหลัก
ส่วน `Organization` ใช้ `display_name` (ไทย) และ `legal_name` (อังกฤษ)

## Master codes ที่ใช้ (ค้นจาก immutable code ไม่ hard-code UUID)

- `organization_statuses.code = ACTIVE`
- `branch_statuses.code = ACTIVE`
- `audit_action_types.code = bootstrap.goldensoft_organization` (สร้างให้อัตโนมัติถ้ายังไม่มี)

ถ้า master ที่จำเป็นไม่พบหรือไม่ active จะ **หยุดและ rollback**

## Environment

```env
# จำเป็นเฉพาะตอนยืนยันเขียนข้อมูล
ORGANIZATION_BOOTSTRAP_CONFIRM=CREATE_GOLDENSOFT_ORGANIZATION
```

ต้องมีค่าเชื่อมต่อแพลตฟอร์มตามปกติด้วย เช่น
`NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_DB_CA_CERT_PATH`

## คำสั่ง

```bash
# 1) Preview เท่านั้น (ไม่เขียนข้อมูล) — ได้ exit code 1
npm run org:bootstrap-goldensoft

# 2) ตั้ง ORGANIZATION_BOOTSTRAP_CONFIRM ใน shell ชั่วคราว แล้วรันอีกครั้งเพื่อเขียนจริง

# 3) ตรวจแบบอ่านอย่างเดียว
npm run org:verify-goldensoft
```

## Preview แสดงอะไร

- โปรเจกต์ Supabase ที่กำลังเชื่อมต่อ
- รหัสองค์กร `GOLDENSOFT` และชื่อ `โกลเด้นซอฟต์`
- รหัสสาขา `GOLDENSOFT-01` และชื่อ `สาขาที่ 1`
- สิ่งที่จะสร้างหรือ reuse
- `Write operations: NONE` และ `ยังไม่มีการเขียนข้อมูล` เมื่อไม่มี confirmation

## Transaction สร้างอะไร (ใน transaction เดียว)

1. `Organization` (`GOLDENSOFT`)
2. `Branch` (`GOLDENSOFT-01`) ผูกกับองค์กรข้างต้น
3. Audit event `bootstrap.goldensoft_organization`
   (เก็บ organization code, branch code, source, timestamp, created/reused — ไม่มี secret)

## การป้องกันข้อมูลซ้ำ / ความขัดแย้ง

- องค์กร `GOLDENSOFT` มีอยู่แล้วและชื่อ/สถานะตรงกัน → **reuse**
- องค์กรมีอยู่แต่ชื่อหรือสถานะไม่ตรง → **rollback** (ไม่แก้ทับ)
- สาขา `GOLDENSOFT-01` อยู่คนละองค์กร → **rollback**
- สาขามีอยู่ใต้ GOLDENSOFT และตรงกัน → **reuse**
- ห้ามเปลี่ยน code หลังสร้าง — สคริปต์ไม่แก้ code เดิม
- รันซ้ำหลายครั้งไม่เกิดข้อมูลซ้ำ (idempotent)

## verify ตรวจอะไร

- พบองค์กร `GOLDENSOFT` เพียง 1 รายการ, ชื่อไทย `โกลเด้นซอฟต์`, สถานะ Active
- พบสาขา `GOLDENSOFT-01` เพียง 1 รายการ, ผูกกับ GOLDENSOFT, ชื่อไทย `สาขาที่ 1`, สถานะ Active
- ไม่มี code ซ้ำ
- มี audit event หลังการสร้างจริง

แสดงผลภาษาไทย และ exit code 1 หากข้อใดไม่ผ่าน
