# GoldenSoft Platform

Central Auth และ multi-tenant control plane สำหรับ Resident V2, HR และ QR Station

## Stack

- Next.js 15 App Router · React 19 · TypeScript strict · Tailwind CSS 4
- Prisma ORM + PostgreSQL (`platform` schema)
- Supabase Auth (Central project)

## Project refs (locked)

| Role | Ref |
|------|-----|
| New / Expected | `horyhrnqbeaivdztekfv` |
| Blocked Legacy | `invnwpyshxdadhocueeh` |

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

**ห้าม** รัน `prisma migrate deploy` / `db push` จนกว่า Project Manager จะอนุมัติ

## Safety

- Environment Guard บล็อก Legacy project ref ใน URL / DATABASE_URL / DIRECT_URL
- Production ห้าม `ALLOW_TEST_AUTH=true`
- Secret key อยู่เฉพาะ server (`SUPABASE_SECRET_KEY`)
- ห้าม commit `.env*` (ยกเว้น `.env.example`)

## Docs

- `docs/ENVIRONMENT_SETUP.md` — ขั้นตอนใส่ Connection String / Keys
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/TEST_RESULTS.md`
- Architecture ADRs ใน `docs/`
