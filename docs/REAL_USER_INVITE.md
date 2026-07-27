# Real User Invitation — การตั้งค่าสำหรับทดสอบส่งจริง

เอกสารนี้เป็นคู่มือสำหรับผู้ใช้ (ไม่รันอัตโนมัติจาก Cursor)

## ค่าใน `.env.local` (อย่าใส่ secret ในเอกสาร)

```env
AUTH_INVITE_MODE=mock
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_INVITE_REDIRECT_PATH=/auth/accept-invite
EXPECTED_SUPABASE_PROJECT_REF=horyhrnqbeaivdztekfv
BLOCKED_LEGACY_SUPABASE_PROJECT_REF=invnwpyshxdadhocueeh

# เปิดเมื่อพร้อมทดสอบส่งจริง 1 บัญชี และได้รับอนุมัติแล้วเท่านั้น
# AUTH_INVITE_MODE=real
# AUTH_REAL_INVITE_TEST_EMAIL=your-test@example.com
# AUTH_REAL_INVITE_CONFIRM=SEND_ONE_REAL_INVITE
```

กฎสำคัญ:

- Production ต้องเป็น `AUTH_INVITE_MODE=real`
- `NEXT_PUBLIC_APP_URL` ต้องเป็น origin อย่างเดียว ไม่มี path / query / hash และไม่มี trailing slash หลัง normalize
- development อนุญาต `http://localhost:3000` หรือ IP ใน LAN เช่น `http://192.168.1.177:3000`
- production ต้องเป็น HTTPS
- Redirect สร้างฝั่ง server เท่านั้น: `{NEXT_PUBLIC_APP_URL}/auth/accept-invite`
- ห้ามรับ redirect URL เต็มจาก client
- ยืนยันการส่งจริงอ่านจาก server env เท่านั้น ห้ามส่ง confirmation จาก client

## ตั้งค่าใน Supabase Dashboard (ทำด้วยมือ)

ไปที่โครงการ `horyhrnqbeaivdztekfv` → **Authentication** → **URL Configuration**

### Site URL

- รอบทดสอบ local: `http://localhost:3000`
- หรือ URL จริงของ Platform เมื่อทดสอบบนโดเมนจริง

### Redirect URLs

เพิ่มอย่างน้อย:

```text
{NEXT_PUBLIC_APP_URL}/auth/accept-invite
```

ตัวอย่าง local:

```text
http://localhost:3000/auth/accept-invite
http://localhost:3000/auth/set-password
http://192.168.1.177:3000/auth/accept-invite
http://192.168.1.177:3000/auth/set-password
```

ห้ามเพิ่มโดเมนที่ไม่ใช่ของ Platform  
ห้ามแก้ Dashboard อัตโนมัติจากสคริปต์

## ขั้นตอนความปลอดภัยก่อนส่งจริง

1. รัน `npm run auth:invite-readiness` (read-only, ไม่ส่งอีเมล)
2. ตรวจว่า migration `0003_user_invitations` applied และสถานะคำเชิญครบ 7 ค่า
3. ตั้ง `AUTH_INVITE_MODE=real` เฉพาะเมื่อพร้อม
4. ตั้ง `AUTH_REAL_INVITE_CONFIRM=SEND_ONE_REAL_INVITE`
5. (ทางเลือก) ตั้ง `AUTH_REAL_INVITE_TEST_EMAIL` เป็นอีเมลเดียวถ้าต้องการจำกัดช่วงทดสอบ — เว้นว่าง = ส่งได้ทุกอีเมล
6. หากยังไม่มี confirmation ระบบจะตอบแบบ Preview และ **ไม่ส่งอีเมล / ไม่สร้าง Auth user / ไม่เขียน invitation เป็น AUTH_SENT**
7. รออนุมัติจากผู้ใช้ก่อนกดเชิญจริงจากหน้าเว็บ

## สคริปต์ที่เกี่ยวข้อง

| คำสั่ง | ความหมาย |
|--------|----------|
| `npm run auth:invite-readiness` | ตรวจความพร้อมแบบ read-only |
| `npm run db:verify` | ตรวจ schema / masters / migration |
| `npm run db:preflight` | ตรวจการเชื่อมต่อฐานข้อมูล |

ห้ามรัน invite/resend จริงจาก Cursor ใน Phase 5C
