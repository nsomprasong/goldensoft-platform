# Central Auth Foundation

เอกสารออกแบบจากวิเคราะห์ Legacy Auth/RBAC (อ่านอย่างเดียว) สำหรับ GoldenSoft Platform  
**ยังไม่ใช่ schema สุดท้าย และยังไม่ต้องเขียนโค้ด**

---

## 1. Legacy Auth Flow

1. ผู้ใช้เข้าสู่ระบบผ่านหน้า Login ของ Resident (Supabase Auth)
2. Session เก็บใน Cookie ผ่าน `@supabase/ssr` (`createServerClient`)
3. `middleware.ts` เรียก `updateSession` ทุก request (ยกเว้น static assets)
4. Middleware ใช้ `supabase.auth.getClaims()` อ่าน JWT จาก session cookie
5. ถ้าไม่มี claims → redirect `/login` (หน้า) หรือ `401` (API) ยกเว้น public routes
6. ใช้ `claims.sub` เป็น `authUserId` แล้ว lookup `Employee` ในฐานข้อมูลแอป
7. ตรวจเงื่อนไขตามลำดับ: employee มีอยู่ → `isActive` → role มีอยู่และ `isActive` → permissions ไม่ว่าง
8. ตรวจ `app_metadata.session_epoch` ให้ตรงกับ `Employee.sessionEpoch` (single-device / session replace)
9. ถ้า `mustResetPassword` → บังคับไป `/set-password`
10. หน้า: map path → permission; API: map method+path → permission; ไม่ผ่าน → `/forbidden` หรือ `403`
11. API `/api/auth/me` คืน employee + role + permissions สำหรับ client UX

Stack ที่เกี่ยวข้อง: Next.js App Router, `@supabase/ssr`, `@supabase/supabase-js`, Prisma + PostgreSQL (แอป), ไม่มีตาราง User ใน Prisma

---

## 2. Legacy User–Employee Relationship

| ชั้น | ความหมายใน Legacy |
|------|-------------------|
| Supabase Auth User | Identity จริง (`auth.users.id` = UUID) |
| `Employee.authUserId` | FK แบบ soft link ไป Auth UUID (`String? @unique @db.Uuid`) |
| `Employee` | ทั้ง HR profile + login principal + RBAC subject |

จุดสำคัญ:

- ไม่มี model `User` ใน Prisma — Auth User ≠ แถวในแอปโดยตรง
- หนึ่ง Auth UUID ผูก Employee ได้หนึ่งคน (`authUserId` unique)
- Employee ยังมี `email` / `username` / `phone` เป็น unique ของแอปเอง
- Role ผูกผ่าน `Employee.roleId` → `Role`
- `sessionEpoch` อยู่บน Employee และถูก stamp ลง JWT `app_metadata.session_epoch`
- การไม่มี mapping / inactive / ไม่มี role / permissions ว่าง = ปฏิเสธการเข้าใช้ (fail closed)

---

## 3. Legacy RBAC Flow

```
Auth UUID (JWT sub)
  → Employee (authUserId)
    → Role (roleId)
      → RolePermission
        → Permission.code
```

การบังคับใช้จริง:

- **Source of truth ตอน runtime:** permission codes จาก DB (`RolePermission` → `Permission.code`)
- **Middleware:** ตรวจ page/API ด้วยรายการ codes ของ employee
- **Server helpers:** เช่น `authorizeCurrentUser(permission)` ตรวจซ้ำใน API handler
- **UI:** PermissionGate / `/api/auth/me` ใช้เพื่อ UX เท่านั้น ไม่ใช่ security boundary
- มี hardcoded role→permission matrix และ route maps ใน `lib/auth/authorization.ts` สำหรับ Resident modules (booking, kitchen, pos, hr, …) — ใช้คู่กับ DB แต่ผูกติดโดเมนแอปเดียว

โมเดลหลัก: `Role`, `Permission`, `RolePermission`, `Employee.roleId`

---

## 4. ส่วนที่ห้าม Copy ตรง ๆ

1. **สมมติว่า Employee = Identity ทั้งระบบ** — ระบบใหม่ต้องแยก Platform User ออกจาก Employee ของแต่ละผลิตภัณฑ์
2. **RBAC ระดับแอปเดียว** (role/permission ของ Resident ปน HR/POS ในชุดเดียว) — Platform ต้องมีชั้น entitlement + product membership ก่อน role ในแอป
3. **Hardcoded page/API permission matrix ของ Resident** — ห้ามย้ายทั้งก้อนเข้า Platform
4. **Middleware ที่รู้ path ทั้งแอป Resident** — แต่ละผลิตภัณฑ์ดูแล route map เอง
5. **`branchName` แบบข้อความบน Employee** — ต้องเป็น entity Branch ที่เป็นของ Organization
6. **Session epoch แบบ single-device ทั้งบัญชี** โดยไม่คิด multi-product / multi-device policy ของ Platform
7. **ผสม HR fields (nationalId, bank, payroll, …) เข้า identity กลาง**
8. **สร้าง Auth user จากแอปธุรกิจโดยตรงแบบ Legacy** โดยไม่มี Organization/Product context

สิ่งที่ควรเก็บแนวคิด (ไม่ copy implementation):

- Cookie session + Supabase SSR
- Fail closed เมื่อไม่ map / ไม่มีสิทธิ์
- Server-side permission check ซ้ำทุก mutation
- Permission เป็น string code ที่เสถียร

---

## 5. Central Auth Target Flow

เป้าหมาย: **GoldenSoft Platform เป็นเจ้าของ Central Auth และ identity กลาง**

```
Login (Supabase Auth — project กลางชุดเดียว)
  → JWT / Session Cookie (sub = Platform User UUID)
  → Platform resolves:
       User Identity
       Organization Membership(s)
       Branch context (ถ้ามี)
       Product Membership(s) + Entitlement/Subscription
       Platform Role/Permission (ชั้นกลาง)
  → Application Context ถูกส่ง/resolve ให้ Resident V2 / HR / QR Station
  → แต่ละผลิตภัณฑ์ enforce product-level RBAC บน UUID เดียวกัน
```

หลักการ:

- UUID ของ Supabase Auth = UUID เดียวกันทุกโปรแกรมในช่วงเริ่มต้น
- Platform เป็นที่ออก identity และ membership; ผลิตภัณฑ์ไม่เป็น Auth issuer
- Legacy Resident ยังใช้ Auth/DB เดิมต่อไป — **ห้ามแก้และห้ามเชื่อม DB เดิม**

---

## 6. ตารางหลักที่ Platform ต้องมี

รายการแนวคิด (ชื่อสุดท้ายปรับได้ตอนออกแบบ schema):

| ตาราง | หน้าที่ |
|--------|---------|
| `UserProfile` / `PlatformUser` | โปรไฟล์แอปที่ผูก `authUserId` (Supabase UUID) |
| `Organization` | องค์กรลูกค้า / ผู้เช่าใช้ระบบ |
| `Branch` | สาขาภายใต้ Organization |
| `OrganizationMembership` | User ↔ Organization (+ สถานะ active) |
| `Product` | รหัสผลิตภัณฑ์: `platform`, `resident`, `hr`, `qr_station`, … |
| `ProductMembership` | User ↔ Organization ↔ Product (+ สถานะ) |
| `PlatformRole` | บทบาทระดับ Platform / org admin |
| `PlatformPermission` | สิทธิ์กลาง (เช่น org.manage, billing.view) |
| `PlatformRolePermission` | M2M role–permission |
| `MembershipRole` | ผูก role กับ membership (org และ/หรือ product) |
| `Subscription` | แผน/รอบบิลของ Organization |
| `Entitlement` | สิทธิการใช้ผลิตภัณฑ์/ฟีเจอร์จาก subscription |
| `AuthLink` (optional ภายหลัง) | เชื่อม Legacy auth UUID ↔ Central UUID |

ผลิตภัณฑ์อย่าง Resident V2 / HR ยังมีตาราง Employee/Role ของตนเองได้ แต่ต้องอ้าง `authUserId` กลาง ไม่สร้าง Auth แยก

---

## 7. Token และ Session ที่ระบบใหม่ต้องใช้

| รายการ | ข้อกำหนดเริ่มต้น |
|--------|------------------|
| Issuer | Supabase Auth ของ project กลางเท่านั้น |
| Subject (`sub`) | UUID ผู้ใช้กลาง — ใช้เหมือนกันทุกแอป |
| Transport | HTTP-only cookie session ผ่าน `@supabase/ssr` (แนวทางเดียวกับ Legacy ที่พิสูจน์แล้ว) |
| Verification | Server ใช้ `getUser()` / `getClaims()` — ห้ามเชื่อ client-only |
| Claims ที่ Platform ควรควบคุม | อย่างน้อย identity; **อย่ายัด permissions ทั้งก้อนลง JWT** ในช่วงแรก |
| Application context | Resolve จาก Platform DB หลัง authenticate (orgId, branchId, product, membership, entitlements) |
| Session policy | กำหนดชัดว่า multi-device ได้หรือไม่; ถ้าใช้ epoch ต้องอยู่ชั้น Platform ไม่ใช่ Employee ของแอปใดแอปหนึ่ง |
| Refresh | Middleware/session helper ของแต่ละแอป refresh cookie ตาม Supabase SSR |

ช่วงแรก: แอปลูกเรียก Platform (หรือ shared library อ่าน Platform DB) เพื่อได้ context — ไม่ให้แต่ละแอปเดา org/product จาก JWT เองโดยไม่มีแหล่งความจริง

---

## 8. Application Context สำหรับ Resident V2, HR และ QR Station

หลัง login สำเร็จ ทุกผลิตภัณฑ์ต้องได้ context อย่างน้อย:

```json
{
  "authUserId": "<uuid>",
  "organizationId": "<uuid>",
  "branchId": "<uuid|null>",
  "productCode": "resident | hr | qr_station | platform",
  "membershipStatus": "active",
  "entitlements": ["..."],
  "platformPermissions": ["..."],
  "productRoles": ["..."],
  "productPermissions": ["..."]
}
```

| ผลิตภัณฑ์ | Context เพิ่มเติมที่คาดหวัง |
|-----------|------------------------------|
| **Resident V2** | branch ที่ทำงาน, employee mapping ใน Resident DB, role/permission ของโรงแรม |
| **HR** | org/branch scope, employee HR record แยกจาก login identity, HR permissions |
| **QR Station** | station/branch scope แคบ, permission จำกัด (เช่น clock / scan), อาจเป็น device+user dual context ภายหลัง |
| **Platform** | org admin, subscription, user invite, product enablement |

กฎ: ผลิตภัณฑ์ enforce สิทธิ์ในขอบเขตของตน แต่ **ห้ามข้าม org** และ **ห้ามใช้ผลิตภัณฑ์ที่ไม่มี entitlement**

---

## 9. การรองรับหลาย Organization และหลาย Branch

1. User คนเดียวเป็นสมาชิกได้หลาย Organization
2. ในแต่ละ Organization มีได้หลาย Branch
3. Session/UI ต้องมี **active Organization** และ **active Branch** (ถ้าผลิตภัณฑ์ต้องการ)
4. การสลับ org/branch เป็น Platform concern — แอปลูกอ่านค่าที่เลือกแล้วบังคับ scope ใน query ทุกครั้ง
5. ProductMembership และ Entitlement ผูกที่ระดับ Organization (และอาจจำกัด Branch ภายหลัง)
6. Unknown org/branch/membership → fail closed
7. ข้อมูลธุรกิจของแต่ละผลิตภัณฑ์ต้องมี `organizationId` (และ `branchId` เมื่อเกี่ยวข้อง) — ห้าม global unique แบบ Legacy single-tenant โดยไม่คิด tenant

---

## 10. วิธีเชื่อมผู้ใช้ Legacy กับ Central Auth ในอนาคต

Legacy **ไม่แก้และไม่ย้าย Auth ทันที** แผนเชื่อมภายหลังแบบปลอดภัย:

1. สร้างผู้ใช้ใน Central Supabase Auth (UUID ใหม่) หรือเชิญด้วยอีเมลเดียวกัน
2. เก็บ mapping: `legacyAuthUserId` ↔ `centralAuthUserId` (+ employee/org identifiers) ใน Platform (`AuthLink`)
3. Resident V2/HR ใหม่ใช้เฉพาะ Central UUID
4. ช่วงขนย้าย: อนุญาต login ขนานได้เฉพาะผ่านสะพานที่ควบคุม — ไม่แชร์ secret/DB ของ Legacy ให้ระบบใหม่
5. ห้ามบังคับให้ Central UUID = Legacy UUID เสมอไป; ถ้าจะ reuse UUID ต้องออกแบบ migration Auth แยกและอนุมัติเป็น phase
6. ตัดการพึ่ง Legacy Auth เมื่อผลิตภัณฑ์ใหม่รับ traffic ครบและ mapping ตรวจแล้ว

---

## 11. Security Rules ที่ต้องบังคับ

1. Authenticate ทุก request ที่ไม่ใช่ public route
2. Authorize ทุก mutation และทุกการอ่านข้อมูลอ่อนไหวฝั่ง server
3. UI gate เป็น UX เท่านั้น — server/API คือ security boundary
4. Unknown role / permission / product / membership → **fail closed**
5. ห้าม hard-code secret, service role key, หรือ user identity ใน client
6. ห้ามส่ง Prisma / service role เข้า Client Component
7. ตรวจราคา/สิทธิ์/สถานะเงินฝั่ง server (ผลิตภัณฑ์); Platform ตรวจ subscription/entitlement
8. ทุก query ธุรกิจต้องบังคับ `organizationId` (และ branch เมื่อจำเป็น)
9. Product ที่ไม่มี entitlement ใช้งานไม่ได้ แม้ user จะ login สำเร็จ
10. ไม่เชื่อมต่อหรือ migrate บนฐานข้อมูล Legacy จากงาน Platform
11. ไม่เชื่อ claims ที่ client ส่งมาเรื่อง org/role โดยไม่ตรวจจาก Platform DB
12. Audit การเปลี่ยน membership, role, subscription ให้ระบุ actor ที่เป็น Central UUID

---

## 12. คำถามที่ยังต้องตัดสินใจก่อนเขียนโค้ด

1. **Active org/branch เก็บที่ไหน?** cookie ของ Platform, `user_metadata`/`app_metadata`, หรือตาราง `UserSessionPreference`?
2. **Multi-device session:** ใช้ต่อแบบ Legacy `session_epoch` หรืออนุญาตหลายอุปกรณ์ต่อบัญชี?
3. **Product RBAC อยู่ที่ Platform หรือใน DB ของแต่ละผลิตภัณฑ์?** (แนะนำ: Platform = entitlement + org roles; ผลิตภัณฑ์ = domain roles)
4. **Employee ของ Resident/HR สร้างเมื่อไหร่?** invite จาก Platform, provisioning จาก HR, หรือทั้งสองทาง?
5. **ใครสร้าง Auth user ได้บ้าง?** เฉพาะ Platform admin / org admin / self-register?
6. **รูปแบบ permission code กลาง** vs แยก namespace ต่อผลิตภัณฑ์ (`platform.*`, `resident.*`, `hr.*`)?
7. **QR Station** เป็น user login ปกติ, device credential, หรือ hybrid?
8. **ช่วงแรกแชร์ Supabase project เดียว:** แยก schema/DB role อย่างไรให้แอปไม่ข้ามข้อมูลกัน?
9. **การเชื่อม Legacy:** ผูกด้วยอีเมล, employee code, หรือ manual admin link เท่านั้น?
10. **Subscription/Entitlement model:** seat-based, branch-based, หรือ feature-flag ต่อผลิตภัณฑ์?
11. **Platform Role กับ Org Role** แยกตารางหรือใช้ model เดียวที่มี scope?
12. **ภาษา/slug ของ Organization และ Branch** และข้อกำหนด unique ภายใน tenant?

---

## ขอบเขตเอกสารนี้

- วิเคราะห์จาก Legacy Auth/RBAC เท่าที่จำเป็น
- ออกแบบทิศทาง Central Auth ของ Platform
- **ยังไม่สร้าง source code, ยังไม่ติดตั้ง package, ยังไม่รัน migration**
)
