# คู่มือสร้างผู้ดูแลระบบสูงสุดครั้งแรก (Phase 4B)

เครื่องมือแบบ one-time / idempotent สำหรับผูกบัญชี Supabase Auth ที่มีอยู่แล้ว
เข้ากับโปรไฟล์แพลตฟอร์ม บทบาท `SUPER_ADMIN` และการเป็นสมาชิกองค์กร

## ข้อห้าม

- ห้ามสร้างบัญชี Supabase Auth จากสคริปต์นี้
- ห้ามตั้งรหัสผ่านหรือส่งอีเมลเชิญ
- ห้ามรันเขียนฐานข้อมูลโดยไม่มี confirmation
- ห้ามใช้กับ Legacy project (`invnwpyshxdadhocueeh`)
- ต้องใช้เฉพาะ project `horyhrnqbeaivdztekfv`

## Environment ที่ต้องตั้งค่า

ใส่ใน shell หรือไฟล์ env ชั่วคราวของเครื่องคุณเท่านั้น **ห้าม commit ค่าจริง**

```env
BOOTSTRAP_AUTH_USER_ID=
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_DISPLAY_NAME=
BOOTSTRAP_ORGANIZATION_CODE=
BOOTSTRAP_BRANCH_CODE=

# จำเป็นเฉพาะตอนยืนยันเขียนข้อมูล
BOOTSTRAP_CONFIRM=CREATE_FIRST_SUPER_ADMIN
```

| ตัวแปร | ความหมาย |
|--------|----------|
| `BOOTSTRAP_AUTH_USER_ID` | UUID ของผู้ใช้ใน Supabase Auth (ต้องมีอยู่แล้ว) |
| `BOOTSTRAP_ADMIN_EMAIL` | อีเมลที่ต้องตรงกับ Auth user และยืนยันแล้ว |
| `BOOTSTRAP_ADMIN_DISPLAY_NAME` | ชื่อที่แสดงในโปรไฟล์ |
| `BOOTSTRAP_ORGANIZATION_CODE` | รหัสองค์กร (`customer_code`) ที่มีอยู่แล้ว |
| `BOOTSTRAP_BRANCH_CODE` | รหัสสาขาในองค์กรนั้น (ถ้าว่างและมีสาขาเดียวจะเลือกให้อัตโนมัติ) |
| `BOOTSTRAP_CONFIRM` | ต้องเป็น `CREATE_FIRST_SUPER_ADMIN` เท่านั้นจึงจะเขียนข้อมูล |

ต้องมีค่าเชื่อมต่อแพลตฟอร์มตามปกติด้วย เช่น  
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_DB_CA_CERT_PATH`

## คำสั่ง

```bash
# 1) ดู Preview เท่านั้น (ไม่เขียนข้อมูล) — ควรได้ exit code 1
npm run auth:bootstrap-admin

# 2) เมื่อตรวจ Preview แล้ว ตั้ง BOOTSTRAP_CONFIRM แล้วรันอีกครั้ง
#    (ตั้งค่าใน shell ชั่วคราว ไม่ใส่ใน source code)

# 3) ตรวจสิทธิ์แบบอ่านอย่างเดียว
npm run auth:verify-admin
```

## Preview จะแสดงอะไร

- Project ref
- อีเมล Auth แบบปกปิด
- รหัสองค์กร / รหัสสาขา
- รายการเปลี่ยนแปลงที่จะเกิดขึ้น
- `Write operations: NONE` หากยังไม่มี confirmation

ข้อความสำคัญ:

- `พร้อมสร้างผู้ดูแลระบบสูงสุด`
- `ยังไม่มีการเขียนข้อมูล`
- `สร้างผู้ดูแลระบบสูงสุดสำเร็จ`
- `การตรวจสอบสิทธิ์ผ่านครบถ้วน`

## Transaction จะสร้างหรือใช้ซ้ำอะไร

ใน transaction เดียว:

1. โปรไฟล์ผู้ใช้ (`auth_user_id` + อีเมลจาก Auth)
2. บทบาทแพลตฟอร์ม `SUPER_ADMIN`
3. การเป็นสมาชิกองค์กร บทบาท `OWNER` สถานะใช้งาน
4. สิทธิ์เข้าถึงสาขา (`SELECTED` ของสาขาที่เลือก หรือใช้ของเดิมถ้าครอบคลุมแล้ว)
5. Audit `bootstrap.first_super_admin` (ไม่เก็บรหัสผ่าน/โทเคน)

หากข้อมูลตรงกันอยู่แล้วจะ **ใช้ซ้ำ** ไม่สร้างซ้ำ  
หากขัดแย้งจะ **หยุดและ rollback**

## ลำดับงานที่แนะนำ

1. สร้าง Auth user ใน Supabase Dashboard ด้วยตนเอง (นอก Cursor)
2. ยืนยันอีเมล
3. ตรวจว่าองค์กรและสาขาเป้าหมายมีในฐานข้อมูลแล้ว
4. รัน `auth:bootstrap-admin` แบบ Preview
5. ตั้ง `BOOTSTRAP_CONFIRM` แล้วรันจริง
6. รัน `auth:verify-admin`
7. ทดสอบเข้าสู่ระบบที่ `/login`
