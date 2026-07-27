"use client";

import { CheckCheck, Save } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  ORGANIZATION_ASSIGNABLE_PERMISSIONS,
  PLATFORM_PERMISSION_DESCRIPTIONS,
  PLATFORM_PERMISSION_LABELS,
  PLATFORM_PERMISSIONS,
  permissionResourceGroup,
  type PlatformPermission,
} from "@/lib/permissions/codes";
import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { Input } from "@/components/ui/input";
import { TH } from "@/lib/i18n/th";

export function CustomRoleForm(props: {
  /** Null for platform-wide system / platform roles. */
  organizationId: string | null;
  mode: "create" | "edit";
  roleId?: string;
  /** organization = org roles API; platform = platform staff roles API. */
  roleKind?: "organization" | "platform";
  /** Allow editing permission checkboxes on system roles (SUPER_ADMIN actor). */
  allowSystemPermissionEdit?: boolean;
  /** Platform SUPER_ADMIN role itself — permissions are locked (always all). */
  lockPermissions?: boolean;
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
  const roleKind = props.roleKind ?? "organization";
  const isSystem = props.initial?.isSystem === true;
  const permissionsReadOnly =
    props.lockPermissions === true ||
    (isSystem && !props.allowSystemPermissionEdit);
  const metadataReadOnly = isSystem || roleKind === "platform";

  const grouped = useMemo(() => {
    const assignablePerms =
      roleKind === "platform"
        ? Object.values(PLATFORM_PERMISSIONS)
        : ORGANIZATION_ASSIGNABLE_PERMISSIONS;
    const q = query.trim().toLowerCase();
    const map = new Map<string, PlatformPermission[]>();
    for (const code of assignablePerms) {
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
  }, [query, roleKind]);

  function toggle(code: string) {
    if (permissionsReadOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleGroup(codes: PlatformPermission[]) {
    if (permissionsReadOnly) return;
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
          : await fetch(
              roleKind === "platform"
                ? `/api/platform/platform-roles/${props.roleId}`
                : `/api/platform/roles/${props.roleId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  roleKind === "platform" || isSystem
                    ? {
                        description: description || null,
                        ...(props.lockPermissions
                          ? {}
                          : { permissionCodes: [...selected] }),
                      }
                    : {
                        nameTh,
                        nameEn,
                        description: description || null,
                        permissionCodes: [...selected],
                      },
                ),
              },
            );
      const raw = await res.text();
      let data: { message?: string; role?: { id: string } } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { message?: string; role?: { id: string } };
        } catch {
          setError(
            res.ok
              ? "บันทึกสำเร็จแต่ตอบกลับผิดรูปแบบ"
              : "บันทึกไม่สำเร็จ กรุณาลองใหม่",
          );
          return;
        }
      }
      if (!res.ok) {
        setError(data.message ?? "บันทึกไม่สำเร็จ");
        return;
      }
      const detailPath =
        roleKind === "platform"
          ? `/roles/platform/${props.roleId}`
          : `/roles/${props.roleId}`;
      router.push(
        props.mode === "create" ? `/roles/${data.role?.id}` : detailPath,
      );
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <section className="card grid gap-3">
        <label className="grid gap-1 text-[length:var(--text-label)]">
          รหัสบทบาท
          <Input
            value={code}
            disabled={props.mode === "edit" || metadataReadOnly || pending}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="BRANCH_MANAGER"
          />
        </label>
        <label className="grid gap-1 text-[length:var(--text-label)]">
          ชื่อภาษาไทย
          <Input
            value={nameTh}
            disabled={metadataReadOnly || pending}
            onChange={(e) => setNameTh(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[length:var(--text-label)]">
          ชื่อภาษาอังกฤษ
          <Input
            value={nameEn}
            disabled={metadataReadOnly || pending}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[length:var(--text-label)]">
          คำอธิบาย
          <textarea
            className="textarea"
            value={description}
            disabled={pending || (isSystem && permissionsReadOnly && !props.lockPermissions)}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {roleKind === "platform" ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
            บทบาทแพลตฟอร์ม — แก้สิทธิ์ของพนักงาน GoldenSoft
            {props.lockPermissions
              ? " (SUPER_ADMIN มีสิทธิ์ทั้งหมดเสมอ)"
              : ""}
          </p>
        ) : isSystem ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
            บทบาทระบบ — แก้ได้เฉพาะรายการสิทธิ์ (มีผลกับทุกองค์กร)
          </p>
        ) : null}
      </section>

      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[length:var(--text-section)] font-semibold">
            สิทธิ์ของบทบาท
          </h2>
          <Input
            className="max-w-xs"
            placeholder="ค้นหาสิทธิ์..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {grouped.map(([group, codes]) => (
          <div key={group} className="rounded-[var(--radius-md)] border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium capitalize">{group}</p>
              {!permissionsReadOnly ? (
                <IconTextButton
                  type="button"
                  variant="ghost"
                  onClick={() => toggleGroup(codes)}
                  icon={<CheckCheck aria-hidden="true" />}
                  label="เลือกทั้งหมดในหมวด"
                />
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
                      disabled={permissionsReadOnly || pending}
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

      {!permissionsReadOnly || props.lockPermissions ? (
        <IconTextButton
          type="button"
          disabled={
            pending ||
            (!props.lockPermissions && selected.size === 0) ||
            (!isSystem && roleKind !== "platform" && (!nameTh || !nameEn)) ||
            (props.mode === "create" && !code)
          }
          onClick={submit}
          icon={
            <Save
              className={pending ? "animate-pulse" : undefined}
              aria-hidden="true"
            />
          }
          label={pending ? TH.common.loading : "บันทึก"}
        />
      ) : (
        <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
          คุณไม่มีสิทธิ์แก้ไขสิทธิ์ของบทบาทนี้
        </p>
      )}
    </div>
  );
}
