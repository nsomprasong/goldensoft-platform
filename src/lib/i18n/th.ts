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
    home: "ภาพรวม",
    organizations: "องค์กร",
    branches: "สาขา",
    users: "ผู้ใช้งาน",
    roles: "บทบาทและสิทธิ์",
    products: "ผลิตภัณฑ์",
    plans: "แพ็กเกจ",
    subscriptions: "การสมัครใช้บริการ",
    auditLogs: "บันทึกกิจกรรม",
    settings: "ตั้งค่าระบบ",
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
    deniedTitle: "ไม่มีสิทธิ์เข้าถึง",
    deniedBody: "คุณไม่มีสิทธิ์ดำเนินการนี้",
  },

  common: {
    loading: "กำลังโหลดข้อมูล...",
    notFound: "ไม่พบข้อมูลที่ต้องการ",
    error: "เกิดข้อผิดพลาด กรุณาลองใหม่",
    sessionExpired: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
    connectionError: "ไม่สามารถเชื่อมต่อระบบได้",
    saved: "บันทึกข้อมูลสำเร็จ",
    failed: "ดำเนินการไม่สำเร็จ",
    forbidden: "คุณไม่มีสิทธิ์ดำเนินการ",
    conflictReload: "ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดใหม่",
    inUse: "ไม่สามารถดำเนินการได้ เนื่องจากข้อมูลยังถูกใช้งาน",
    currentOrganization: "องค์กรปัจจุบัน",
    currentBranch: "สาขาปัจจุบัน",
    allBranches: "ทุกสาขา",
    noBranch: "ยังไม่ได้เลือกสาขา",
    select: "เลือก",
    continue: "ดำเนินการต่อ",
    cancel: "ยกเลิก",
    confirm: "ยืนยัน",
    search: "ค้นหา",
    filter: "กรอง",
    create: "เพิ่ม",
    edit: "แก้ไข",
    save: "บันทึก",
    back: "ย้อนกลับ",
    actions: "การดำเนินการ",
    status: "สถานะ",
    required: "จำเป็น",
    empty: "ยังไม่มีข้อมูล",
    previous: "ก่อนหน้า",
    next: "ถัดไป",
    page: "หน้า",
    of: "จาก",
    user: "ผู้ใช้",
    details: "รายละเอียด",
  },

  org: {
    add: "เพิ่มองค์กร",
    edit: "แก้ไขข้อมูลองค์กร",
    codeImmutable: "รหัสองค์กรไม่สามารถเปลี่ยนได้หลังสร้าง",
    suspend: "ระงับการใช้งานองค์กร",
    suspendWarning: "องค์กรนี้มีผู้ใช้งานหรือบริการที่ยังเปิดอยู่",
    code: "รหัสองค์กร",
    nameTh: "ชื่อภาษาไทย",
    nameEn: "ชื่อภาษาอังกฤษ",
    legalName: "ชื่อทางกฎหมาย",
    taxId: "เลขประจำตัวผู้เสียภาษี",
    email: "อีเมล",
    phone: "โทรศัพท์",
    address: "ที่อยู่",
    createdAt: "วันที่สร้าง",
    updatedAt: "วันที่แก้ไขล่าสุด",
  },

  branch: {
    add: "เพิ่มสาขา",
    edit: "แก้ไขสาขา",
    code: "รหัสสาขา",
    nameTh: "ชื่อไทย",
    nameEn: "ชื่ออังกฤษ",
    address: "ที่อยู่",
    phone: "โทรศัพท์",
    email: "อีเมล",
    latitude: "ละติจูด",
    longitude: "ลองจิจูด",
    geofence: "รัศมี geofence (เมตร)",
    timezone: "เขตเวลา",
    isPrimary: "เป็นสาขาหลัก",
    setPrimary: "กำหนดเป็นสาขาหลัก",
    suspend: "ระงับสาขา",
    codeImmutable: "รหัสสาขาไม่สามารถเปลี่ยนได้หลังสร้าง",
    cannotSuspendPrimary: "ห้ามปิดสาขาหลักจนกว่าจะเลือกสาขาหลักใหม่",
    cannotPrimaryInactive: "ห้ามตั้งสาขาที่ไม่ใช้งานเป็นสาขาหลัก",
  },

  users: {
    add: "เพิ่มผู้ใช้งาน",
    invite: "ส่งคำเชิญ",
    reinvite: "ส่งคำเชิญอีกครั้ง",
    inviteSuccess: "ส่งคำเชิญสำเร็จ",
    exists: "บัญชีนี้มีอยู่แล้วในระบบ",
    emailInOtherOrg: "อีเมลนี้อยู่ในองค์กรอื่นแล้ว",
    pendingInvite: "ผู้ใช้งานยังไม่ได้ตอบรับคำเชิญ",
    suspend: "ระงับบัญชี",
    activate: "เปิดใช้งานบัญชี",
    displayName: "ชื่อแสดงผล",
    email: "อีเมล",
    stepAccount: "ข้อมูลบัญชี",
    stepOrganization: "เลือกองค์กร",
    stepRole: "เลือกบทบาทองค์กร",
    stepBranchScope: "เลือกขอบเขตสาขา",
    stepConfirm: "ตรวจสอบและยืนยัน",
    scopeAll: "ทุกสาขา",
    scopeSelected: "เลือกบางสาขา",
    scopeNone: "ไม่มีสิทธิ์ระดับสาขา",
  },

  roles: {
    title: "บทบาทและสิทธิ์",
    platformRoles: "บทบาทระดับแพลตฟอร์ม",
    organizationRoles: "บทบาทระดับองค์กร",
    permissionMatrix: "ตารางสิทธิ์",
    assign: "กำหนดบทบาท",
    remove: "ยกเลิกบทบาท",
    systemImmutable: "บทบาทระบบไม่สามารถแก้รหัสหรือลบได้",
    lastAdmin: "ไม่สามารถนำสิทธิ์ออกได้ เนื่องจากเป็นผู้ดูแลคนสุดท้าย",
    lastOwner: "องค์กรต้องมีเจ้าของอย่างน้อย 1 คน",
  },

  audit: {
    title: "บันทึกกิจกรรม",
    actor: "ผู้กระทำ",
    action: "ประเภทเหตุการณ์",
    organization: "องค์กร",
    dateFrom: "ตั้งแต่วันที่",
    dateTo: "ถึงวันที่",
    entity: "รายการที่เกี่ยวข้อง",
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
    AUTH_SENT: "ส่งคำเชิญแล้ว",
    COMPLETED: "เปิดใช้งานแล้ว",
    FAILED: "ส่งไม่สำเร็จ",
    PLATFORM_SETUP_FAILED: "จัดเตรียมสิทธิ์ไม่สำเร็จ",
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
    dashboardTitle: "ภาพรวมแพลตฟอร์ม",
    dashboardBody:
      "ศูนย์กลางยืนยันตัวตน (Central Auth) องค์กรหลายแห่ง สาขา ผู้ใช้งาน บทบาท และการสมัครใช้บริการ",
    organizationsTitle: "องค์กร",
    branchesTitle: "สาขา",
    usersTitle: "ผู้ใช้งาน",
    rolesTitle: "บทบาทและสิทธิ์",
    productsTitle: "ผลิตภัณฑ์",
    plansTitle: "แพ็กเกจ",
    subscriptionsTitle: "การสมัครใช้บริการ",
    auditTitle: "บันทึกกิจกรรม",
    settingsTitle: "ตั้งค่าระบบ",
    settingsBody: "การตั้งค่าระบบจะเปิดในเฟสถัดไป — ขณะนี้แสดงเฉพาะภาพรวม",
    selectOrgTitle: "เลือกองค์กรที่ต้องการใช้งาน",
    selectOrgBody: "บัญชีของคุณมีสิทธิ์หลายองค์กร กรุณาเลือกองค์กรที่ต้องการเข้าใช้งาน",
  },
} as const;

export function labelStatus(code: string): string {
  return TH.status[code] ?? code;
}

export function labelInvitationStatus(code: string): string {
  const labels: Record<string, string> = {
    PENDING: "รอส่งคำเชิญ",
    AUTH_SENT: "ส่งคำเชิญแล้ว",
    COMPLETED: "เปิดใช้งานแล้ว",
    FAILED: "ส่งไม่สำเร็จ",
    PLATFORM_SETUP_FAILED: "จัดเตรียมสิทธิ์ไม่สำเร็จ",
    CANCELLED: "ยกเลิก",
    EXPIRED: "หมดอายุ",
  };
  return labels[code] ?? code;
}

export function labelRole(code: string): string {
  return TH.role[code] ?? code;
}

/** Display code with Thai label for admin surfaces. */
export function labelWithCode(thai: string, code: string): string {
  return `${thai} (${code})`;
}
