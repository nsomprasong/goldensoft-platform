# Environment Setup — PostgreSQL + Supabase

## Locked project refs

- `EXPECTED_SUPABASE_PROJECT_REF=horyhrnqbeaivdztekfv`
- `BLOCKED_LEGACY_SUPABASE_PROJECT_REF=invnwpyshxdadhocueeh`

## TLS certificate

| Item | Value |
|------|--------|
| Public CA file | `certs/prod-ca-2021.crt` (Supabase Root 2021 CA) |
| Env var | `SUPABASE_DB_CA_CERT_PATH=certs/prod-ca-2021.crt` |

- Runtime / preflight load this CA and set `rejectUnauthorized: true`
- **ห้าม** `NODE_TLS_REJECT_UNAUTHORIZED=0` หรือ `rejectUnauthorized: false`
- Commit ได้เฉพาะ Public CA — ห้าม commit client cert / private key
- ห้าม log เนื้อหา certificate

## Connection strategy

| Variable | Source | Port | Notes |
|----------|--------|------|-------|
| `DATABASE_URL` | Supavisor **Transaction** pooler | **6543** | Runtime Prisma adapter; `pgbouncer=true` ได้; **ห้าม** `sslmode` / `sslrootcert` / `sslcert` / `sslkey` |
| `DIRECT_URL` | Supavisor **Session** pooler | **5432** | Prisma CLI; ต้องมี `sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt` |

ตัวอย่างรูปแบบ (secrets ไม่ใส่ในเอกสาร):

```env
SUPABASE_DB_CA_CERT_PATH=certs/prod-ca-2021.crt
DATABASE_URL="postgresql://...@...pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...@...pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt"
```

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
2. Copy **Transaction pooler** URL → `DATABASE_URL` (port 6543, `pgbouncer=true` ตาม panel; **ไม่ใส่** sslmode/sslrootcert)
3. Copy **Session pooler** URL → `DIRECT_URL` (port 5432) แล้วต่อท้าย  
   `?sslmode=verify-full&sslrootcert=../certs/prod-ca-2021.crt`  
   (ถ้ามี query อยู่แล้วใช้ `&`)
4. ตั้ง `SUPABASE_DB_CA_CERT_PATH=certs/prod-ca-2021.crt`
5. Copy **Publishable key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
6. Copy **Secret key** → `SUPABASE_SECRET_KEY`
7. ตั้ง `PLATFORM_CONTEXT_COOKIE_SECRET` เป็นค่าสุ่มยาว
8. บันทึกเป็น `.env.local` (ถูก gitignore แล้ว)
9. รัน `npm run db:preflight` (read-only; ห้าม apply migration)
10. รอ Project Manager อนุมัติก่อน `prisma migrate deploy`

## Guard rules

- `APP_CODE=PLATFORM`
- Project ref จาก Supabase URL / DATABASE_URL / DIRECT_URL ต้องตรงกัน และเป็น project ใหม่
- พบ Legacy ref → หยุดทันที
- CA path ต้องมีอยู่ ไม่ว่าง อยู่ภายใน project root ห้าม path traversal
- Production ต้องมี CA + Publishable Key และห้าม `ALLOW_TEST_AUTH=true`
- Error ต้องไม่แสดง password / secret / certificate PEM

## Real User Invitation

ดูรายละเอียดการตั้งค่า URL Configuration, first-invite gate และ readiness ที่  
[`docs/REAL_USER_INVITE.md`](./REAL_USER_INVITE.md)

## Migration preview

ไฟล์: `prisma/migrations/0001_platform_initial/migration.sql`  
สร้าง schema/table เฉพาะ `platform` — **ยังไม่ Apply จนกว่า PM จะอนุมัติ**
