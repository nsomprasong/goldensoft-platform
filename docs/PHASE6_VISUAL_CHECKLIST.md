# Phase 6 Visual Checklist

ตรวจหน้าหลักหลัง Design System polish (desktop ≈ 1440/1024 และ mobile ≈ 375/768)

| Route | Desktop | Mobile | หมายเหตุ |
| --- | --- | --- | --- |
| `/` | [ ] | [ ] | Greeting, summary cards, quick actions, activity |
| `/login` | [ ] | [ ] | Auth shell, FormField, error ไทย |
| `/organizations` | [ ] | [ ] | Table/card, filter, StatusBadge |
| `/organizations/new` | [ ] | [ ] | Form 2-col → 1-col |
| `/organizations/[id]` | [ ] | [ ] | Summary + sections |
| `/organizations/[id]/branches` | [ ] | [ ] | MobileRecordCard |
| `/users` | [ ] | [ ] | Invitations + memberships |
| `/users/invite` | [ ] | [ ] | Step indicator; mock badge (SUPER_ADMIN) |
| `/roles` | [ ] | [ ] | Role cards + permission list |
| `/audit-logs` | [ ] | [ ] | Timeline mobile / table desktop |
| `/products` | [ ] | [ ] | Record cards |
| `/plans` | [ ] | [ ] | Record cards |
| `/subscriptions` | [ ] | [ ] | Record cards |
| `/settings` | [ ] | [ ] | Read-only sections only |
| `/auth/accept-invite` | [ ] | [ ] | Auth shell + password form |

เกณฑ์ผ่านเร็ว:
- ไม่มี horizontal overflow ทั้งหน้า
- Sidebar ไม่ทับ content บน desktop; mobile ใช้ drawer
- ปุ่มหลักบนมือถือกดได้ (~44px)
- สถานะใช้ `StatusBadge` ไม่พึ่งสีอย่างเดียว
