"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  PLATFORM_PERMISSION_DESCRIPTIONS,
  PLATFORM_PERMISSION_LABELS,
  PLATFORM_PERMISSIONS,
  permissionResourceGroup,
  type PlatformPermission,
} from "@/lib/permissions/codes";

const ALL_PERMS = Object.values(PLATFORM_PERMISSIONS);

export function CustomRoleForm(props: {
  organizationId: string;
  mode: "create" | "edit";
  roleId?: string;
  initial?: {
    code: string;
    nameTh: string;
    nameEn: string;
    description: string;
    permissionCodes: string[];
    isSystem?: boolean;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [code, setCode] = useState(props.initial?.code ?? "");
  const [nameTh, setNameTh] = useState(props.initial?.nameTh ?? "");
  const [nameEn, setNameEn] = useState(props.initial?.nameEn ?? "");
  const [description, setDescription] = useState(
    props.initial?.description ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(props.initial?.permissionCodes ?? []),
  );
  const readOnly = props.initial?.isSystem === true;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, PlatformPermission[]>();
    for (const code of ALL_PERMS) {
      const label = PLATFORM_PERMISSION_LABELS[code];
      const desc = PLATFORM_PERMISSION_DESCRIPTIONS[code];
      if (
        q &&
        !label.toLowerCase().includes(q) &&
        !desc.toLowerCase().includes(q) &&
        !code.toLowerCase().includes(q)
      ) {
        continue;
      }
      const group = permissionResourceGroup(code);
      const list = map.get(group) ?? [];
      list.push(code);
      map.set(group, list);
    }
    return [...map.entries()];
  }, [query]);

  function toggle(code: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(codes: PlatformPermission[]) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = codes.every((c) => next.has(c));
      for (const c of codes) {
        if (allOn) next.delete(c);
        else next.add(c);
      }
      return next;
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      const payload = {
        organizationId: props.organizationId,
        code,
        nameTh,
        nameEn,
        description: description || null,
        permissionCodes: [...selected],
      };
      const res =
        props.mode === "create"
          ? await fetch("/api/platform/roles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/platform/roles/${props.roleId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nameTh,
                nameEn,
                description: description || null,
                permissionCodes: [...selected],
              }),
            });
      const data = (await res.json()) as { message?: string; role?: { id: string } };
      if (!res.ok) {
        setError(data.message ?? "บันทึกไม่สำเร็จ");
        return;
      }
      router.push(props.mode === "create" ? `/roles/${data.role?.id}` : `/roles/${props.roleId}`);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <section className="card grid gap-3">
        <label className="grid gap-1 text-[length:var(--text-label)]">
          รหัสบทบาท
          <input
            className="input"
            value={code}
            disabled={props.mode === "edit" || readOnly || pending}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BRANCH_MANAGER"
          />
        </label>
        <label className="grid gap-1 text-[length:var(--text-label)]">
          ชื่อภาษาไทย
          <input
            className="input"
            value={nameTh}
            disabled={readOnly || pending}
            onChange={(e) => setNameTh(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[length:var(--text-label)]">
          ชื่อภาษาอังกฤษ
          <input
            className="input"
            value={nameEn}
            disabled={readOnly || pending}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[length:var(--text-label)]">
          คำอธิบาย
          <textarea
            className="textarea"
            value={description}
            disabled={readOnly || pending}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </section>

      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[length:var(--text-section)] font-semibold">
            สิทธิ์ของบทบาท
          </h2>
          <input
            className="input max-w-xs"
            placeholder="ค้นหาสิทธิ์..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {grouped.map(([group, codes]) => (
          <div key={group} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium capitalize">{group}</p>
              {!readOnly ? (
                <button
                  type="button"
                  className="btn btn-ghost !min-h-8"
                  onClick={() => toggleGroup(codes)}
                >
                  เลือกทั้งหมดในหมวด
                </button>
              ) : null}
            </div>
            <ul className="grid gap-2">
              {codes.map((perm) => (
                <li key={perm}>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(perm)}
                      disabled={readOnly || pending}
                      onChange={() => toggle(perm)}
                    />
                    <span>
                      <span className="block font-medium">
                        {PLATFORM_PERMISSION_LABELS[perm]}
                      </span>
                      <span className="block text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                        {PLATFORM_PERMISSION_DESCRIPTIONS[perm]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {error ? (
        <p className="text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {!readOnly ? (
        <button
          type="button"
          className="btn"
          disabled={pending || selected.size === 0 || !nameTh || !nameEn || (props.mode === "create" && !code)}
          onClick={submit}
        >
          {pending ? "กำลังบันทึก..." : "บันทึกบทบาท"}
        </button>
      ) : (
        <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
          บทบาทระบบดูได้อย่างเดียว — ยังไม่เปิดให้แก้สิทธิ์ในเฟสนี้
        </p>
      )}
    </div>
  );
}
