# GoldenSoft Platform

Central Auth และ multi-tenant control plane สำหรับ Resident V2, HR และ QR Station

## Stack

- Next.js 15 App Router · React 19 · TypeScript strict · Tailwind CSS 4
- Prisma ORM + PostgreSQL (`platform` schema)
- Master tables instead of Prisma/PostgreSQL enums
- Supabase Auth (Central project)

## Project refs (locked)

| Role | Ref |
|------|-----|
| New / Expected | `horyhrnqbeaivdztekfv` |
| Blocked Legacy | `invnwpyshxdadhocueeh` |

## Local ports (fixed)

| App | Port | `npm run dev` |
|-----|------|----------------|
| `goldensoft-platform` | **3000** | this package |
| `goldensoft-hr` | **3001** | HR service |
| `goldensoft-app` | **3002** | Customer App |

Ports are locked; if the port is already in use, `npm run dev` exits instead of auto-bumping.

## Quick start (local code)

```bash
cp .env.example .env.local
# ใส่ค่าจาก Supabase Connect Panel ตาม docs/ENVIRONMENT_SETUP.md

npm install
npm run db:validate
npm run db:generate
npm test
npm run build
```

## Database scripts

| Command | Description |
|---------|-------------|
| `npm run db:validate` | Validate Prisma schema |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migration:check` | Safety-check migration SQL (platform only) |
| `npm run db:preflight` | Env guard + read-only DB ping (**needs real `.env.local`**) |
| `npm run db:seed` | Seed (after migration applied + approval) |
| `npm run seed:hr-permissions` | Upsert HR (`GOLDENSOFT_HR`) permission catalog — `SEED_MODE=system` only, ไม่ต้อง migration |

Permission catalog เป็นข้อมูล ไม่ใช่ schema: เพิ่ม/แก้สิทธิ์ HR ด้วย `npm run seed:hr-permissions`
(upsert by `code`, idempotent) — ห้ามสร้าง migration ที่มีแต่ `INSERT` เพราะ additive migration check
ต้องการ `ALTER TABLE` / `CREATE INDEX`

**ห้าม** รัน `prisma migrate deploy` / `db push` จนกว่า Project Manager จะอนุมัติ

## Safety

- Environment Guard บล็อก Legacy project ref ใน URL / DATABASE_URL / DIRECT_URL
- Trusted TLS: `SUPABASE_DB_CA_CERT_PATH=certs/prod-ca-2021.crt` + `rejectUnauthorized: true` (ห้าม insecure TLS workaround)
- `DATABASE_URL` ห้ามใส่ `sslmode`/`sslrootcert`; `DIRECT_URL` ต้อง `sslmode=verify-full` + `sslrootcert=../certs/prod-ca-2021.crt`
- Production ห้าม `ALLOW_TEST_AUTH=true`
- Secret key อยู่เฉพาะ server (`SUPABASE_SECRET_KEY`)
- ห้าม commit `.env*` (ยกเว้น `.env.example`); ห้าม commit private key / client cert
- Migration ต้องไม่มี `CREATE TYPE` / `AS ENUM` และแตะเฉพาะ schema `platform` (`npm run db:migration:check`)
- รอ PM อนุมัติก่อน Apply Migration

## Docs

- `docs/ENVIRONMENT_SETUP.md` — ขั้นตอนใส่ Connection String / Keys
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/TEST_RESULTS.md`
- Architecture ADRs ใน `docs/`
