# Environment Setup

## Required variables

| Variable | Purpose |
|----------|---------|
| `APP_CODE` | ต้องเป็น `PLATFORM` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของ Central Supabase เท่านั้น |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (public) |
| `EXPECTED_SUPABASE_PROJECT_REF` | Project ref ที่อนุญาต |
| `BLOCKED_LEGACY_SUPABASE_PROJECT_REF` | Project ref ของ Legacy ที่ต้องบล็อก |
| `DATABASE_URL` | ฐานทดสอบท้องถิ่น เช่น `file:./dev.db` |
| `PLATFORM_CONTEXT_COOKIE_SECRET` | เซ็น cookie context (≥16 chars) |
| `ALLOW_TEST_AUTH` | `1` เฉพาะ test/dev — ห้าม production |

## Guard rules

1. ดึง project ref จาก hostname ของ Supabase URL
2. หากตรงกับ `BLOCKED_LEGACY_SUPABASE_PROJECT_REF` → หยุดทันที
3. หากไม่ตรง `EXPECTED_SUPABASE_PROJECT_REF` → หยุด
4. ห้าม log secret / service role key

## Phase 2 constraint

- ใช้ SQLite หรือ PostgreSQL ทดสอบเท่านั้น
- **ห้าม** รัน migration กับ Supabase จริง
- **ห้าม** เชื่อม Legacy database

คัดลอกจาก `.env.example` ไป `.env` / `.env.local` แล้วแก้ค่า (ไฟล์เหล่านี้ถูก gitignore)
