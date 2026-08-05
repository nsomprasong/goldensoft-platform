"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type Row = { id: string; name: string; scope: string; branchName: string | null; employeeCount: number; isActive: boolean };
type Props = { roleId: string; organizationId: string; branches: Array<{ id: string; name: string }> };

async function readJsonResponse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return null;
  return response.json().catch(() => null) as Promise<T | null>;
}

export function RolePositionsPanel({ roleId, organizationId, branches }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"ORGANIZATION" | "BRANCH">("ORGANIZATION");
  const [branchId, setBranchId] = useState("");
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/platform/roles/${roleId}/positions`);
      const data = await readJsonResponse<{ positions?: Row[]; message?: string }>(response);
      if (response.ok && data) { setRows(data.positions ?? []); setError(null); }
      else setError(data?.message ?? "โหลดตำแหน่งไม่สำเร็จ");
    } catch {
      setError("ไม่สามารถเชื่อมต่อเพื่อโหลดตำแหน่งได้");
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    setSaving(true); setError(null);
    const response = await fetch(`/api/platform/roles/${roleId}/positions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId, nameTh: name, description: description || null, scope, branchId: scope === "BRANCH" ? branchId : null }),
    });
    const data = await readJsonResponse<{ message?: string }>(response);
    if (!response.ok) { setError(data?.message ?? "เพิ่มตำแหน่งไม่สำเร็จ"); setSaving(false); return; }
    setName(""); setDescription(""); setOpen(false); await load(); setSaving(false);
  }

  async function unlink(row: Row, confirmed = false) {
    if (row.employeeCount > 0 && !confirmed) { setConfirmRow(row); return; }
    setSaving(true);
    const response = await fetch(`/api/platform/roles/${roleId}/positions?positionId=${row.id}`, { method: "DELETE" });
    if (response.ok) { setConfirmRow(null); await load(); }
    else setError((await readJsonResponse<{ message?: string }>(response))?.message ?? "ยกเลิกการผูกไม่สำเร็จ");
    setSaving(false);
  }

  return (
    <section className="card grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold">ตำแหน่งที่ใช้บทบาทนี้</h2><p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">ตำแหน่งใช้ระบุหน้าที่งาน ส่วนบทบาทใช้กำหนดสิทธิ์การใช้งานระบบ</p></div>
        <button type="button" className="btn" onClick={() => setOpen(true)}>เพิ่มตำแหน่งใหม่</button>
      </div>
      {loading ? <p>กำลังโหลดตำแหน่ง…</p> : error ? <p role="alert" className="text-[var(--danger)]">{error}</p> : rows.length === 0 ? <p className="text-[var(--text-muted)]">ยังไม่มีตำแหน่งที่ใช้บทบาทนี้</p> : (
        <ul className="grid gap-2">{rows.map((row) => <li key={row.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"><strong>{row.name}</strong><p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{row.scope}{row.branchName ? ` · ${row.branchName}` : ""} · พนักงาน {row.employeeCount} คน · {row.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}</p><button type="button" className="btn btn-sm" disabled={saving} onClick={() => void unlink(row)}>ยกเลิกการผูก</button></li>)}</ul>
      )}
      {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--overlay)] p-4"><button className="absolute inset-0" aria-label="ปิด" onClick={() => setOpen(false)} /><div className="card relative z-10 grid w-full max-w-lg gap-3" role="dialog" aria-modal="true"><h3>เพิ่มตำแหน่งใหม่</h3><label>ชื่อตำแหน่ง<Input value={name} onChange={(event) => setName(event.target.value)} /></label><label>คำอธิบาย<textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>ขอบเขตการใช้งาน<select className="input" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="ORGANIZATION">ใช้ทุกสาขาในองค์กร</option><option value="BRANCH">ใช้เฉพาะสาขา</option></select></label>{scope === "BRANCH" ? <label>สาขา<select className="input" value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">— เลือกสาขา —</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}<div className="flex gap-2"><button type="button" className="btn btn-primary" disabled={saving || !name.trim() || (scope === "BRANCH" && !branchId)} onClick={() => void create()}>{saving ? "กำลังบันทึก…" : "เพิ่มตำแหน่ง"}</button><button type="button" className="btn" disabled={saving} onClick={() => setOpen(false)}>ยกเลิก</button></div></div></div> : null}
      {confirmRow ? <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--overlay)] p-4" role="dialog" aria-modal="true"><div className="card w-full max-w-lg"><h3>ยืนยันการยกเลิกการผูก</h3><p>ตำแหน่งนี้มีพนักงาน {confirmRow.employeeCount} คน การยกเลิกจะไม่เปลี่ยนบทบาทของพนักงานเดิม</p><div className="flex gap-2"><button className="btn btn-primary" onClick={() => void unlink(confirmRow, true)}>ยืนยันโดยไม่เปลี่ยนพนักงานเดิม</button><button className="btn" onClick={() => setConfirmRow(null)}>ยกเลิก</button></div></div></div> : null}
    </section>
  );
}
