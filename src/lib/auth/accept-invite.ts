export function validateInvitePassword(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < 8) return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  if (password !== confirmation) {
    return "รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน";
  }
  return null;
}
