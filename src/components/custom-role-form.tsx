"use client";

import { CheckCheck, RotateCcw, Save } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/admin-ui";
import { Input } from "@/components/ui/input";
import { TH } from "@/lib/i18n/th";
import type { PermissionRegistryItem } from "@/lib/permissions/registry";

export function CustomRoleForm(props: {
  /** Null for platform-wide system / platform roles. */
  organizationId: string | null;
  mode: "create" | "edit";
  roleId?: string;
  /** organization = org roles API; platform = platform staff roles API. */
  roleKind?: "organization" | "platform" | "organization-template";
  /** Allow editing permission checkboxes on system roles (SUPER_ADMIN actor). */
  allowSystemPermissionEdit?: boolean;
  /** Platform SUPER_ADMIN role itself — permissions are locked (always all). */
  lockPermissions?: boolean;
  permissionCatalog?: PermissionRegistryItem[];
  /** Organization-scope permissions granted only while staff supports an assigned customer. */
  customerSupportPermissionCatalog?: PermissionRegistryItem[];
  returnPath?: string;
  hasOrganizationOverride?: boolean;
  initial?: {
    code: string;
    nameTh: string;
    nameEn: string;
    description: string;
    permissionCodes: string[];
    isSystem?: boolean;
    isActive?: boolean;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [query, setQuery] = useState("");
  const [code, setCode] = useState(props.initial?.code ?? "");
  const [nameTh, setNameTh] = useState(props.initial?.nameTh ?? "");
  const [nameEn, setNameEn] = useState(props.initial?.nameEn ?? "");
  const [description, setDescription] = useState(
    props.initial?.description ?? "",
  );
  const [isActive, setIsActive] = useState(props.initial?.isActive ?? true);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(props.initial?.permissionCodes ?? []),
  );
  const roleKind = props.roleKind ?? "organization";
  const isSystem = props.initial?.isSystem === true;
  const permissionsReadOnly =
    props.lockPermissions === true ||
    (isSystem && !props.allowSystemPermissionEdit);
  const metadataReadOnly =
    (isSystem && !props.allowSystemPermissionEdit) ||
    (roleKind === "platform" && props.mode === "edit");

  const groupedByScope = useMemo(() => {
    const groupCatalog = (catalog: PermissionRegistryItem[] | undefined) => {
    const assignablePerms = catalog?.length
      ? catalog.map((item) => item.code)
      : roleKind === "platform"
        ? Object.values(PLATFORM_PERMISSIONS)
        : ORGANIZATION_ASSIGNABLE_PERMISSIONS;
    const q = query.trim().toLowerCase();
    const map = new Map<string, string[]>();
    for (const code of assignablePerms) {
      const legacyCode = code as PlatformPermission;
      const registry = catalog?.find((item) => item.code === code);
      const label = registry?.menuNameTh ?? PLATFORM_PERMISSION_LABELS[legacyCode] ?? code;
      const desc = registry?.descriptionTh ?? PLATFORM_PERMISSION_DESCRIPTIONS[legacyCode] ?? "";
      if (
        q &&
        !label.toLowerCase().includes(q) &&
        !desc.toLowerCase().includes(q) &&
        !code.toLowerCase().includes(q)
      ) {
        continue;
      }
      const group = registry?.categoryTh ?? permissionResourceGroup(legacyCode);
      const list = map.get(group) ?? [];
      list.push(code);
      map.set(group, list);
    }
    return [...map.entries()];
    };
    return {
      primary: groupCatalog(props.permissionCatalog),
      customerSupport:
        roleKind === "platform"
          ? groupCatalog(props.customerSupportPermissionCatalog)
          : [],
    };
  }, [props.customerSupportPermissionCatalog, props.permissionCatalog, query, roleKind]);

  const allCatalog = useMemo(
    () => [
      ...(props.permissionCatalog ?? []),
      ...(props.customerSupportPermissionCatalog ?? []),
    ],
    [props.customerSupportPermissionCatalog, props.permissionCatalog],
  );

  function toggle(code: string) {
    if (permissionsReadOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
        const item = allCatalog.find((row) => row.code === code);
        if (item?.action === "read") {
          for (const sibling of allCatalog) {
            if (sibling.productCode === item.productCode && sibling.menuCode === item.menuCode) next.delete(sibling.code);
          }
        }
      } else {
        next.add(code);
        const item = allCatalog.find((row) => row.code === code);
        if (item && item.action !== "read") {
          const read = allCatalog.find((row) => row.productCode === item.productCode && row.menuCode === item.menuCode && row.action === "read");
          if (read) next.add(read.code);
        }
      }
      return next;
    });
  }

  function toggleGroup(codes: string[]) {
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
          ? await fetch(roleKind === "platform" ? "/api/platform/platform-role-definitions" : "/api/platform/roles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(
              roleKind === "platform"
                ? `/api/platform/platform-roles/${props.roleId}`
                : roleKind === "organization-template"
                  ? `/api/platform/organization-role-templates/${props.roleId}`
                : `/api/platform/roles/${props.roleId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                  roleKind === "platform"
                    ? {
                        description: description || null,
                        ...(roleKind === "platform" && !props.lockPermissions
                          ? { isActive }
                          : {}),
                        ...(props.lockPermissions
                          ? {}
                          : { permissionCodes: [...selected] }),
                      }
                    : isSystem
                      ? {
                          nameTh,
                          nameEn,
                          description: description || null,
                          permissionCodes: [...selected],
                        }
                    : {
                        nameTh,
                        nameEn,
                        description: description || null,
                        permissionCodes: [...selected],
                        isActive,
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
        props.returnPath ??
          (props.mode === "create" ? `/roles/${data.role?.id}` : detailPath),
      );
      router.refresh();
    });
  }

  function resetStandardRole() {
    if (!props.roleId || !props.organizationId) return;
    setError(null);
    setConfirmReset(false);
    start(async () => {
      const response = await fetch(`/api/platform/roles/${props.roleId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: props.organizationId }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? "คืนค่าเริ่มต้นไม่สำเร็จ");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      <section className="card grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-[length:var(--text-section)] font-semibold">ข้อมูลบทบาท</h2>
          <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">กำหนดชื่อ สถานะ และรายละเอียดที่จำเป็น</p>
        </div>
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
        <label className="grid gap-1 text-[length:var(--text-label)] md:col-span-2">
          คำอธิบาย
          <textarea
            className="textarea"
            value={description}
            disabled={pending || (isSystem && permissionsReadOnly && !props.lockPermissions)}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {roleKind === "platform" ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)] md:col-span-2">
            ใช้กับพนักงาน GoldenSoft
            {props.lockPermissions
              ? " (SUPER_ADMIN มีสิทธิ์ทั้งหมดเสมอ)"
              : ""}
          </p>
        ) : isSystem ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-muted)] md:col-span-2">
            บทบาทมาตรฐานของระบบ ใช้ร่วมกันทุกองค์กร
          </p>
        ) : null}
        {props.mode === "edit" &&
        ((!isSystem && roleKind === "organization") ||
          (roleKind === "platform" && !props.lockPermissions)) ? (
          <label className="flex items-center gap-2 text-[length:var(--text-label)] md:col-span-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={pending}
            />
            เปิดใช้งานบทบาท
          </label>
        ) : null}
      </section>

      <section className="card grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[length:var(--text-section)] font-semibold">สิทธิ์การใช้งาน</h2>
            <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">เลือกแล้ว {selected.size} สิทธิ์</p>
          </div>
          {!permissionsReadOnly ? (
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setSelected(new Set(allCatalog.map((item) => item.code)))}>เลือกทั้งหมด</button>
              <button type="button" className="btn btn-sm" onClick={() => setSelected(new Set())}>ยกเลิกทั้งหมด</button>
            </div>
          ) : null}
          <Input
            className="max-w-xs"
            placeholder="ค้นหาสิทธิ์..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {([
          {
            key: "platform-or-organization",
            title: roleKind === "platform" ? "สิทธิ์ระดับแพลตฟอร์ม" : "สิทธิ์ภายในองค์กร",
            description:
              roleKind === "platform"
                ? "ใช้จัดการระบบแพลตฟอร์ม"
                : "ใช้ภายในองค์กรที่เลือก",
            groups: groupedByScope.primary,
          },
          ...(roleKind === "platform" && groupedByScope.customerSupport.length > 0
            ? [{
                key: "customer-support",
                title: "สิทธิ์ดูแลองค์กรลูกค้า",
                description: "ใช้ได้เฉพาะองค์กร สาขา และผลิตภัณฑ์ที่ได้รับมอบหมาย",
                groups: groupedByScope.customerSupport,
              }]
            : []),
        ]).map((section) => (
          <div key={section.key} className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">{section.title}</h3>
              <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">{section.description}</p>
            </div>
            <div className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {section.groups.map(([group, codes]) => (
          <div key={`${section.key}:${group}`} className="min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words font-medium capitalize">{group}</p>
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
            <ul className="grid min-w-0 gap-2">
              {codes.map((perm) => (
                <li key={perm}>
                  <label className="flex min-w-0 cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(perm)}
                      disabled={permissionsReadOnly || pending}
                      onChange={() => toggle(perm)}
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-medium">
                        {allCatalog.find((item) => item.code === perm)?.menuNameTh ?? PLATFORM_PERMISSION_LABELS[perm as PlatformPermission] ?? perm}
                      </span>
                      <span className="block break-words text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                        {allCatalog.find((item) => item.code === perm)?.actionNameTh ?? PLATFORM_PERMISSION_DESCRIPTIONS[perm as PlatformPermission] ?? "สิทธิ์การใช้งาน"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
            ))}
            </div>
          </div>
        ))}
      </section>

      {error ? (
        <p className="text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <section className="card grid gap-1">
        <h3 className="font-semibold">สรุปก่อนบันทึก</h3>
        <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
          เลือกแล้ว {selected.size} สิทธิ์ การเปลี่ยนแปลงมีผลกับผู้ที่ใช้บทบาทนี้
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] p-3">
            <p className="font-medium">{roleKind === "platform" ? "ใช้ในแพลตฟอร์ม" : "ใช้ภายในองค์กร"}</p>
            <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {[...(props.permissionCatalog ?? [])].filter((permission) => selected.has(permission.code)).length} สิทธิ์
            </p>
          </div>
          {roleKind === "platform" ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--info-border)] bg-[var(--info-soft)] p-3">
              <p className="font-medium">ใช้เมื่อดูแลองค์กรลูกค้า</p>
              <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {(props.customerSupportPermissionCatalog ?? []).filter((permission) => selected.has(permission.code)).length} สิทธิ์ · ต้องมี assignment, branch scope และ entitlement ครบ
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {!permissionsReadOnly || props.lockPermissions ? (
        <div className="flex flex-wrap gap-2">
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
          {props.returnPath ? (
            <IconTextButton
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => router.push(props.returnPath!)}
              label="ยกเลิก"
            />
          ) : null}
          {isSystem && roleKind === "organization" && props.hasOrganizationOverride ? (
            <IconTextButton
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmReset(true)}
              icon={<RotateCcw aria-hidden="true" />}
              label="คืนค่าเริ่มต้น"
            />
          ) : null}
        </div>
      ) : (
        <p className="text-[length:var(--text-helper)] text-[var(--text-muted)]">
          คุณไม่มีสิทธิ์แก้ไขสิทธิ์ของบทบาทนี้
        </p>
      )}
      <ConfirmDialog
        open={confirmReset}
        title="คืนค่าบทบาทมาตรฐาน"
        body="ชื่อ คำอธิบาย และสิทธิ์จะกลับเป็นค่ามาตรฐาน ผู้ได้รับบทบาทยังคงเดิม แต่สิทธิ์ที่ใช้งานจริงจะเปลี่ยนทันที"
        confirmLabel="ยืนยันคืนค่า"
        cancelLabel="ยกเลิก"
        onConfirm={resetStandardRole}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
