# Environment Setup — PostgreSQL + Supabase

## Locked project refs

- `EXPECTED_SUPABASE_PROJECT_REF=horyhrnqbeaivdztekfv`
- `BLOCKED_LEGACY_SUPABASE_PROJECT_REF=invnwpyshxdadhocueeh`

## Connection strategy

| Variable | Source | Port | Notes |
|----------|--------|------|-------|
| `DATABASE_URL` | Supavisor **Transaction** pooler | **6543** | Runtime Prisma adapter; เพิ่ม `pgbouncer=true` เมื่อจำเป็น |
| `DIRECT_URL` | Supavisor **Session** pooler | **5432** | Prisma CLI / migrations |

ห้ามเดา host เอง — **Copy จาก Supabase Connect Panel เท่านั้น**  
ห้ามใช้ Connection String ของ Legacy (`invnwpyshxdadhocueeh`)

## Auth keys

| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + Server |
| `SUPABASE_SECRET_KEY` | **Server only** (`src/lib/supabase/admin.ts`) |

ห้ามใส่ Secret ลงตัวแปร `NEXT_PUBLIC_*`

## ขั้นตอนที่ผู้ใช้ต้องทำต่อ

1. เปิด Supabase Project `horyhrnqbeaivdztekfv` → **Connect**
2. Copy **Transaction pooler** URL → ใส่ `DATABASE_URL` (port 6543, ต่อท้าย `pgbouncer=true` ถ้า panel แนะนำ)
3. Copy **Session pooler** URL → ใส่ `DIRECT_URL` (port 5432)
4. Copy **Publishable key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Copy **Secret key** → `SUPABASE_SECRET_KEY`
6. ตั้ง `PLATFORM_CONTEXT_COOKIE_SECRET` เป็นค่าสุ่มยาว
7. บันทึกเป็น `.env.local` (ถูก gitignore แล้ว)
8. รัน `npm run db:preflight` (read-only; ห้าม apply migration)
9. รอ Project Manager อนุมัติก่อน `prisma migrate deploy`

## Guard rules

- `APP_CODE=PLATFORM`
- Project ref จาก Supabase URL / DATABASE_URL / DIRECT_URL ต้องตรงกัน และเป็น project ใหม่
- พบ Legacy ref → หยุดทันที
- `NODE_ENV=production` ห้าม `ALLOW_TEST_AUTH=true` และต้องมี Publishable Key
- Error ต้องไม่แสดง password / secret

## Migration preview

ไฟล์: `prisma/migrations/0001_platform_initial/migration.sql`  
สร้าง schema/table เฉพาะ `platform` — **ยังไม่ Apply ใน Phase นี้**
