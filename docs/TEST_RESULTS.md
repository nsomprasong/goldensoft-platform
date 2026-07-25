# Test Results — Phase 3C

วันที่รัน: 2026-07-25  
Database target: PostgreSQL schema `platform` (migration **not applied**)  
TLS: trusted CA `certs/prod-ca-2021.crt`, `rejectUnauthorized: true`

## Commands

| Command | Result |
|---------|--------|
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS |
| `npm run db:migration:check` | PASS |
| `npm test` | PASS (39/39) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run db:preflight` | **NOT RUN** (รอผู้ใช้ปรับ `.env.local`) |
| migrate deploy / db push / seed | **NOT RUN** |

## Test suites

1. Environment Guard — Legacy block, refs, prod rules
2. `.env.local` load — `APP_CODE=PLATFORM`
3. CA certificate + TLS guard — path safety, rejectUnauthorized, URL SSL rules
4. Tenant isolation
5. Migration SQL safety
6. Schema masters (no enums)
7. Legacy untouched

## Notes

- ห้าม insecure TLS workaround
- Certificate ใน repo เป็น Public CA เท่านั้น (ไม่มี PRIVATE KEY)
