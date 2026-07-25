/** Thai UI copy — technical terms: Thai first, English in parentheses when needed. */

export const TH = {
  brand: "GoldenSoft",
  appName: "แพลตฟอร์มควบคุมกลาง (Platform Control Plane)",

  login: {
    title: "เข้าสู่ระบบ GoldenSoft",
    email: "อีเมล",
    password: "รหัสผ่าน",
    submit: "เข้าสู่ระบบ",
    submitting: "กำลังเข้าสู่ระบบ...",
    invalid: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    forgot: "ลืมรหัสผ่าน",
    contactAdmin: "ติดต่อผู้ดูแลระบบ",
    alreadySignedIn: "คุณเข้าสู่ระบบแล้ว",
  },

  nav: {
    home: "หน้าหลัก",
    organizations: "องค์กร",
    branches: "สาขา",
    products: "ผลิตภัณฑ์",
    plans: "แพ็กเกจ",
    subscriptions: "การสมัครใช้บริการ",
    users: "ผู้ใช้งาน",
    logout: "ออกจากระบบ",
    selectOrganization: "เลือกองค์กร",
    switchOrganization: "เปลี่ยนองค์กร",
    switchBranch: "เปลี่ยนสาขา",
  },

  access: {
    noProfileTitle: "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน GoldenSoft",
    noProfileBody:
      "พบการเข้าสู่ระบบแล้ว แต่ยังไม่มีโปรไฟล์ผู้ใช้บนแพลตฟอร์ม กรุณาติดต่อผู้ดูแลระบบ",
    suspendedTitle: "บัญชีนี้ถูกระงับการใช้งาน",
    suspendedBody: "กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดใช้งานอีกครั้ง",
    noMembershipTitle: "คุณยังไม่มีสิทธิ์เข้าถึงองค์กรใด ๆ",
    noMembershipBody:
      "บัญชีของคุณยังไม่ถูกเพิ่มเป็นสมาชิกองค์กร กรุณาติดต่อผู้ดูแลระบบ",
    forbidden: "คุณไม่มีสิทธิ์เข้าถึงหน้านี้",
  },

  common: {
    loading: "กำลังโหลดข้อมูล...",
    notFound: "ไม่พบข้อมูล",
    error: "เกิดข้อผิดพลาด กรุณาลองใหม่",
    sessionExpired: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
    connectionError: "ไม่สามารถเชื่อมต่อระบบได้",
    saved: "บันทึกสำเร็จ",
    failed: "ดำเนินการไม่สำเร็จ",
    currentOrganization: "องค์กรปัจจุบัน",
    currentBranch: "สาขาปัจจุบัน",
    allBranches: "ทุกสาขา",
    noBranch: "ยังไม่ได้เลือกสาขา",
    select: "เลือก",
    continue: "ดำเนินการต่อ",
    user: "ผู้ใช้",
  },

  status: {
    ACTIVE: "ใช้งาน",
    INACTIVE: "ไม่ใช้งาน",
    SUSPENDED: "ระงับ",
    PENDING: "รอดำเนินการ",
    DISABLED: "ปิดใช้งาน",
    TRIAL: "ทดลองใช้",
    EXPIRED: "หมดอายุ",
    CANCELLED: "ยกเลิก",
    PAST_DUE: "ค้างชำระ",
    CLOSED: "ปิด",
    INVITED: "เชิญแล้ว",
    REMOVED: "ถอดออก",
    RETIRED: "เลิกใช้",
    DRAFT: "ฉบับร่าง",
    PUBLISHED: "เผยแพร่",
  } as Record<string, string>,

  role: {
    SUPER_ADMIN: "ผู้ดูแลระบบสูงสุด",
    SUPPORT: "เจ้าหน้าที่สนับสนุน",
    BILLING_ADMIN: "ผู้ดูแลการเรียกเก็บเงิน",
    OWNER: "เจ้าขององค์กร",
    ADMIN: "ผู้ดูแลองค์กร",
    BILLING_CONTACT: "ผู้ประสานงานด้านการเงิน",
  } as Record<string, string>,

  pages: {
    dashboardTitle: "หน้าหลักแพลตฟอร์ม",
    dashboardBody:
      "ศูนย์กลางยืนยันตัวตน (Central Auth) องค์กรหลายแห่ง สาขา ผลิตภัณฑ์ แพ็กเกจ และการสมัครใช้บริการ",
    organizationsTitle: "องค์กร (Organizations)",
    branchesTitle: "สาขา (Branches)",
    productsTitle: "ผลิตภัณฑ์ (Products)",
    plansTitle: "แพ็กเกจ (Plans)",
    subscriptionsTitle: "การสมัครใช้บริการ (Subscriptions)",
    selectOrgTitle: "เลือกองค์กรที่ต้องการใช้งาน",
    selectOrgBody: "บัญชีของคุณมีสิทธิ์หลายองค์กร กรุณาเลือกองค์กรที่ต้องการเข้าใช้งาน",
  },
} as const;

export function labelStatus(code: string): string {
  return TH.status[code] ?? code;
}

export function labelRole(code: string): string {
  return TH.role[code] ?? code;
}

/** Display code with Thai label for admin surfaces. */
export function labelWithCode(thai: string, code: string): string {
  return `${thai} (${code})`;
}
