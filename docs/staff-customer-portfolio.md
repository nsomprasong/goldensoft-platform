# Staff Customer-Portfolio Management

## Goal

ให้พนักงาน GoldenSoft (โดยเฉพาะพนักงานขาย) ดูแลลูกค้าของตนเองได้จาก Platform Admin:

1. Super Admin เพิ่มพนักงาน GS และกำหนดบทบาท เช่น `SALES`
2. **พนักงานขายสร้างองค์กรลูกค้าเอง** (ไม่ใช่ให้ Super Admin เป็นคนสร้าง/มอบหมายเป็นหลัก)
3. ระบบ**ผูกองค์กรเข้าพอร์ตโฟลิโอของพนักงานขายผู้สร้างอัตโนมัติ**
4. พนักงานขายเชิญ/สร้าง **ADMIN ขององค์กรลูกค้า** ในขั้นตอน onboarding
5. พนักงานขายคนอื่น**มองไม่เห็น**องค์กรนั้น
6. `/staff-portfolio` ของ Super Admin ใช้สำหรับ**โอน/ถอดมอบหมายเมื่อจำเป็น** เท่านั้น

Commission ยัง**อยู่นอกขอบเขต**ของเฟสนี้

## Data model

ตาราง (migration `0007_staff_customer_portfolio`, additive, **applied 2026-07-26**):

`platform.staff_organization_assignments`

| column | notes |
|---|---|
| `staff_user_profile_id` | FK → `user_profiles` — พนักงาน GoldenSoft |
| `organization_id` | FK → `organizations` — องค์กรลูกค้า |
| `assigned_by_auth_user_id` | ผู้ที่สร้างการมอบหมาย (อาจเป็นพนักงานขายผู้สร้าง org หรือ Super Admin) |
| `assigned_at` / `revoked_at` | `revoked_at IS NULL` = ใช้งานอยู่ |
| `note` | ข้อความเสริม เช่น “ผูกอัตโนมัติเมื่อพนักงานขายสร้างองค์กรลูกค้า” |

Partial unique index บน `(staff_user_profile_id, organization_id) WHERE revoked_at IS NULL`

**พนักงานที่ถูกมอบหมายผ่านตารางนี้จะไม่ถูกใส่ใน `organization_memberships`** — เข้าถึงผ่าน authorization helpers เท่านั้น

Seed ที่เกี่ยวข้อง:

- Platform roles `SALES` / `ACCOUNT_MANAGER`
- Permission `platform.customer_portfolio.manage` (มอบหมาย/ถอดพอร์ตโฟลิโอ — Super Admin)
- Static permission `platform.organization.create` สำหรับ `SALES` / `ACCOUNT_MANAGER` (ใน `permissions/codes.ts`)
- Audit `staff_portfolio.assign` / `staff_portfolio.revoke`

## Sales self-serve onboarding

`POST /api/platform/organizations/onboard` และหน้า `/organizations/new`:

| actor | สิทธิ์สร้าง | บทบาทผู้ติดต่อลูกค้า | พอร์ตโฟลิโอ |
|---|---|---|---|
| `SUPER_ADMIN` | ได้ | `OWNER` | ไม่ auto-bind |
| `SALES` / `ACCOUNT_MANAGER` | ได้ (`organization.create`) | `ADMIN` | auto-bind ผู้สร้าง |

หลังสร้างสำเร็จ พนักงานขายสลับ context เป็น `managed_org` เพื่อเชิญผู้ใช้เพิ่ม / จัดการบทบาท / **จัดการสาขา** ขององค์กรนั้นได้ตามกฎเดิม (เชิญ `ADMIN` / `BILLING_CONTACT` ได้ แต่ไม่มอบ `OWNER`)

สิทธิ์สถิตที่เกี่ยวข้อง: `platform.branch.read` + `platform.branch.manage` สำหรับ `SALES` / `ACCOUNT_MANAGER` — ใช้ได้เฉพาะองค์กรในพอร์ตโฟลิโอ (ผ่าน `canManageOrganization` / `canViewOrganization`)

## Authorization

`src/lib/platform/customer-portfolio.ts`:

- `listActiveManagedOrganizationIds`
- `canManageCustomerOrganization` — Super Admin หรือ staff ที่มี org ในพอร์ตโฟลิโอ
- `canManagePortfolioAssignments` — เฉพาะผู้มี `customer_portfolio.manage` (Super Admin) สำหรับหน้า `/staff-portfolio`
- `createStaffOrganizationAssignment` — ใช้ทั้ง auto-bind และ assign โดย Super Admin

`organizations-admin.ts`:

- `canCreateOrganization` — Super Admin หรือมี `organization.create`
- `canManageOrganization` / `canViewOrganization` — membership ∪ managed portfolio (หรือทั้งหมดถ้า Super Admin/SUPPORT list)
- `listOrganizationsForActor` — รวม `managedOrganizationIds` ดังนั้นพนักงานขายเห็นเฉพาะลูกค้าของตน

## Context modes

```
mode: "membership" | "platform_admin" | "managed_org"
```

- `managed_org` — พนักงานขายจัดการลูกค้าในพอร์ตโฟลิโอโดยไม่เป็นสมาชิกองค์กร

**เข้าสู่ระบบครั้งแรกของพนักงานขาย:** `SALES` / `ACCOUNT_MANAGER` ไม่ได้อยู่ใน `organization_memberships` (ตามดีไซน์) และอาจยังไม่มีองค์กรในพอร์ตโฟลิโอ — `decideAccess` ต้องปล่อยให้เข้า shell ได้เพื่อไปสร้างองค์กรลูกค้าที่ `/organizations/new` ไม่ใช่เด้งไปหน้า “ยังไม่มีสิทธิ์เข้าถึงองค์กร”

## Org context (shell mode)

เมื่อเลือกองค์กรลูกค้าใน Context Switcher ระบบยังจำได้ว่าอยู่ในโหมดซัพพอร์ตลูกค้า
แต่**เมนูด้านข้างยังเป็น Platform Admin เต็มชุด** (พนักงาน / ผลิตภัณฑ์ / ตั้งค่า ฯลฯ)
— ไม่ตัดเมนูเมื่อสลับองค์กร

- เมนู **สาขา** จะชี้ไปที่สาขาขององค์กรที่เลือกอยู่
- ฝ่ายขาย (`SALES` / `ACCOUNT_MANAGER`) เห็นเฉพาะลูกค้าในพอร์ตโฟลิโอ — **ลูกค้าใครลูกค้ามัน**
- Customer App bootstrap รองรับทั้ง `platform_admin` และ `managed_org` เพื่อเปิดแอปลูกค้าขณะซัพพอร์ต

## UI

- `/staff` (nav **พนักงาน GoldenSoft**, `SUPER_ADMIN` only) — รายชื่อพนักงาน พร้อมปุ่มไปหน้าเพิ่ม
- `/staff/new` — เพิ่มพนักงาน: อีเมลเข้าใช้ + ประวัติพื้นฐานจากบัตรประชาชน + เลือกบทบาทแบบ list
- `/staff/[id]/edit` — แก้ประวัติ/สถานะ, จัดการบทบาท, รีเซ็ตรหัสผ่าน — ดู
  [staff-administration-password-reset.md](./staff-administration-password-reset.md)
- `/staff-portfolio` (nav "พอร์ตโฟลิโอลูกค้า", visible to `SUPER_ADMIN`
  only) — โอน/ถอดมอบหมายองค์กรลูกค้าเมื่อจำเป็น
- `/organizations` + `/organizations/new` — พนักงานขายสร้างองค์กรลูกค้าเอง
- เมนู **สาขา** — เมื่อเลือกองค์กรในพอร์ตแล้ว เพิ่ม/แก้ไขสาขาขององค์กรนั้นได้
- Context switcher — managed orgs appear in their own optgroup once the
  browser lazily fetches `/api/platform/context`

> หมายเหตุ: เมนู **ผู้ใช้งาน** คือผู้ใช้ขององค์กรลูกค้า ไม่ใช่พนักงาน GS
> ใช้เมนู **พนักงาน GoldenSoft** เพื่อกำหนดบทบาทแพลตฟอร์ม

## How HR / App pick up the change

ไม่ต้องแก้ product logic — bootstrap อ่านสิทธิ์จาก membership/roles ของผู้ใช้ลูกค้าตามเดิม พนักงานขายทำงานเฉพาะใน Platform Admin

## Out of scope

- ระบบคอมมิชชัน
- Migration ใหม่สำหรับ `organization.create` ในตาราง permissions (ใช้ static role mapping ก่อน; เพิ่มใน catalog ได้ภายหลังถ้าต้องการ Role Builder)
