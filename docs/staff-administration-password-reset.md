# พนักงาน GoldenSoft + รีเซ็ตรหัสผ่าน (Platform Admin)

## เป้าหมาย

1. Super Admin เพิ่มพนักงาน GoldenSoft ได้จากหน้าเดียว โดยกรอกประวัติพื้นฐาน
   (ข้อมูลบัตรประชาชน + อีเมล + บทบาทแพลตฟอร์ม) ไม่ต้องให้พนักงานเข้าระบบมาก่อน
2. แก้ไขข้อมูลพนักงาน (ประวัติ, สถานะบัญชี, บทบาท) ได้ภายหลัง
3. รีเซ็ตรหัสผ่านได้โดยผู้ดูแล **ไม่ทราบรหัสผ่านของพนักงาน**

## เมนูและหน้า

| หน้า | ใช้ทำอะไร | สิทธิ์ |
| --- | --- | --- |
| `/staff` | รายชื่อพนักงาน | SUPER_ADMIN |
| `/staff/new` | เพิ่มพนักงาน (บัญชี + บัตรประชาชน + บทบาทแบบ list) | SUPER_ADMIN |
| `/staff/[id]/edit` | แก้ประวัติ/สถานะ, จัดการบทบาท, รีเซ็ตรหัสผ่าน | SUPER_ADMIN |
| `/auth/set-password` | พนักงานตั้งรหัสผ่านของตนเอง | ผู้ถือคุกกี้คำขอรีเซ็ต |
| `/staff-portfolio` | ผูก/ถอดองค์กรลูกค้าให้พนักงาน (ทางเลือก) | `platform.customer_portfolio.manage` |

## การเพิ่มพนักงาน

`POST /api/platform/staff` → `createStaffMember()`

1. ตรวจสิทธิ์ SUPER_ADMIN ตรวจอีเมลซ้ำ และตรวจเลขบัตรประชาชน (checksum + ไม่ซ้ำ)
2. หา/สร้างบัญชีใน Supabase Auth ผ่าน `StaffAuthPort`
   - บัญชีใหม่: สร้างด้วย `email_confirm: true` และรหัสผ่านสุ่มที่ไม่มีใครทราบ
   - บัญชีที่มีอยู่แล้ว: นำมาใช้ต่อ ไม่แก้รหัสผ่านเดิม
3. ใน transaction เดียว: สร้าง `user_profiles` (ACTIVE),
   `staff_profiles` (ประวัติบัตรประชาชน),
   `platform_role_assignments` ตามบทบาทที่เลือก, และ (กรณีบัญชีใหม่)
   เปิดคำขอตั้งรหัสผ่านใน `user_password_resets` + เขียน audit `staff.create`

ชื่อที่แสดง (`displayName`) สร้างจากคำนำหน้า + ชื่อ + นามสกุลภาษาไทยอัตโนมัติ
ประวัติส่วนตัวเก็บในตาราง `staff_profiles` แยกจาก identity กลาง (ไม่ผสมฟิลด์ HR/payroll เข้า `user_profiles`)

พนักงานใหม่จึงเข้าใช้งานครั้งแรกด้วยขั้นตอนเดียวกับการรีเซ็ตรหัสผ่าน

## การรีเซ็ตรหัสผ่าน

```
ผู้ดูแลกด "รีเซ็ตรหัสผ่าน"
  → POST /api/platform/staff/{id}/password-reset
  → เปิดแถว user_password_resets (หมดอายุใน 60 นาที, ใช้ได้ครั้งเดียว)
  → เปลี่ยนรหัสผ่านใน Supabase เป็นค่าสุ่ม (รหัสเดิมใช้ไม่ได้ทันที)

พนักงานเข้าหน้า /login → กรอกอีเมล → เว้นรหัสผ่านว่าง → กดเข้าสู่ระบบ
  → signInWithPassword พบคำขอที่ยังเปิดอยู่ → ออกคุกกี้ลงนาม (HMAC) อายุเท่าคำขอ
  → redirect ไป /auth/set-password  (ยังไม่มี session ใด ๆ)

พนักงานตั้งรหัสผ่าน → POST /api/auth/set-password
  → consumePasswordReset(): ตั้งรหัสผ่านใน Supabase, ปิดคำขอ (consumed_at),
    เขียน audit user.password_reset.complete, ลบคุกกี้
  → redirect กลับ /login?password=set พร้อมข้อความยืนยัน
```

ข้อกำหนดด้านความปลอดภัยที่บังคับไว้ในโค้ด:

- รหัสผ่านว่างจะผ่านได้เฉพาะเมื่อมีคำขอที่ยังเปิดอยู่ของบัญชีสถานะ ACTIVE
  หากไม่มี จะตอบข้อความเดียวกับ "อีเมลหรือรหัสผ่านไม่ถูกต้อง" (กัน account enumeration)
- คำขอมีอายุจำกัด (`PASSWORD_RESET_TTL_MINUTES` = 60) และใช้ได้ครั้งเดียว
  (`updateMany` แบบมีเงื่อนไข ทำให้คำขอซ้อนล้มเหลว)
- หนึ่งบัญชีมีคำขอเปิดค้างได้เพียงรายการเดียว (partial unique index)
- คุกกี้ `gs_pw_reset` เป็น HttpOnly + ลงนาม HMAC ด้วย `PLATFORM_CONTEXT_COOKIE_SECRET`
  และเก็บเพียง `resetId` — สิทธิ์จริงตรวจจากฐานข้อมูลทุกครั้ง
- ผู้ดูแลยกเลิกคำขอได้ (`DELETE .../password-reset`) หากกดผิด
- ปิดการใช้งานบัญชีตัวเองไม่ได้ และ SUPER_ADMIN คนสุดท้ายถูกปิดไม่ได้

ต้องมี `SUPABASE_SECRET_KEY` (Supabase Auth Admin) — `AUTH_INVITE_MODE` ไม่เกี่ยวข้อง
กับเส้นทางนี้ และไม่มีการส่งอีเมลใด ๆ

## Migration

- `0008_staff_password_reset` — `user_password_resets` + permission/audit
- `0009_staff_identity_profiles` — `staff_profiles` (ประวัติบัตรประชาชน 1:1 กับ user_profiles)

ทั้งคู่เป็น additive ฝั่ง platform เท่านั้น

ฟีเจอร์ประวัติพนักงานใช้งานได้หลัง apply `0009` แล้ว

## ล้างข้อมูลทดสอบ

`npm run purge:tenant-data` — dry-run เป็นค่าเริ่มต้น, รายงานสิ่งที่จะถูกลบ

```powershell
# ดูรายงานก่อน
npm run purge:tenant-data

# ลบจริง
$env:PURGE_CONFIRM='PURGE_TENANT_DATA'; npm run purge:tenant-data -- --apply
```

- เก็บบัญชีตาม `PURGE_KEEP_EMAILS` (ค่าเริ่มต้น `nsomprasong@gmail.com`)
  และองค์กรตาม `PURGE_KEEP_ORG_CODES` (ค่าเริ่มต้น `GOLDENSOFT`)
- ไม่ลบข้อมูล master/catalog (สถานะ, บทบาท, permission, product, plan)
- ไม่แตะบัญชีใน Supabase Auth
- ปฏิเสธการทำงานถ้าอีเมลที่ระบุไม่มีในฐานข้อมูล หรือบัญชีที่เก็บไว้ไม่มี SUPER_ADMIN
- ลบตามลำดับ foreign key จริง (billing → invitation → subscription → membership →
  branch → organization → profile) ไม่พึ่ง cascade เพื่อให้รายงานตรงกับที่ลบ
