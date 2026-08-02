"use client";

import {
  useMemo,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";

import { IconTextButton } from "@/components/ui/labeled-icon-button";
import { pushToast } from "@/components/ui/toast";
import {
  DATA_RESET_CONFIRM_PHRASE,
  type DataResetCatalogTargets,
  type DataResetPreview,
  type DataResetTargetOrg,
} from "@/lib/ops/data-reset-types";
import { TH } from "@/lib/i18n/th";

export function DataResetPanel(props: {
  targets: DataResetTargetOrg[];
  catalog: DataResetCatalogTargets;
  confirmPhrase: string;
}) {
  const [selectAllOrgs, setSelectAllOrgs] = useState(false);
  const [orgIds, setOrgIds] = useState<Set<string>>(new Set());
  const [branchIds, setBranchIds] = useState<Set<string>>(new Set());
  const [productIds, setProductIds] = useState<Set<string>>(new Set());
  const [planIds, setPlanIds] = useState<Set<string>>(new Set());
  const [subscriptionIds, setSubscriptionIds] = useState<Set<string>>(
    new Set(),
  );
  const [confirm, setConfirm] = useState("");
  const [preview, setPreview] = useState<DataResetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const selectableOrgs = useMemo(
    () => props.targets.filter((org) => !org.protected),
    [props.targets],
  );

  function clearPreview() {
    setPreview(null);
  }

  function toggleId(
    setter: Dispatch<SetStateAction<Set<string>>>,
    id: string,
    checked: boolean,
  ) {
    clearPreview();
    setter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleOrg(org: DataResetTargetOrg, checked: boolean) {
    if (org.protected) return;
    setSelectAllOrgs(false);
    toggleId(setOrgIds, org.id, checked);
    setBranchIds((prev) => {
      const next = new Set(prev);
      for (const branch of org.branches) next.delete(branch.id);
      return next;
    });
  }

  function toggleBranch(
    org: DataResetTargetOrg,
    branchId: string,
    checked: boolean,
  ) {
    if (org.protected || orgIds.has(org.id)) return;
    setSelectAllOrgs(false);
    toggleId(setBranchIds, branchId, checked);
  }

  function onSelectAllOrgs(checked: boolean) {
    setSelectAllOrgs(checked);
    clearPreview();
    if (checked) {
      setOrgIds(new Set(selectableOrgs.map((org) => org.id)));
      setBranchIds(new Set());
    } else {
      setOrgIds(new Set());
      setBranchIds(new Set());
    }
  }

  function selectAllProducts(checked: boolean) {
    clearPreview();
    setProductIds(
      checked ? new Set(props.catalog.products.map((p) => p.id)) : new Set(),
    );
    if (checked) {
      setPlanIds(new Set());
    }
  }

  function selectAllPlans(checked: boolean) {
    clearPreview();
    setPlanIds(
      checked ? new Set(props.catalog.plans.map((p) => p.id)) : new Set(),
    );
  }

  function selectAllSubscriptions(checked: boolean) {
    clearPreview();
    setSubscriptionIds(
      checked
        ? new Set(props.catalog.subscriptions.map((s) => s.id))
        : new Set(),
    );
  }

  function run(action: "preview" | "apply") {
    setError(null);
    start(async () => {
      const res = await fetch("/api/platform/data-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          selectAll: selectAllOrgs,
          organizationIds: [...orgIds],
          branchIds: [...branchIds],
          productIds: [...productIds],
          planIds: [...planIds],
          subscriptionIds: [...subscriptionIds],
          confirmPhrase: confirm,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        preview?: DataResetPreview;
      };
      if (!res.ok) {
        const message = data.message ?? TH.common.failed;
        setError(message);
        pushToast(message);
        return;
      }
      if (data.preview) setPreview(data.preview);
      if (action === "apply") {
        pushToast(data.message ?? "ล้างข้อมูลเรียบร้อย");
        setConfirm("");
        window.location.reload();
      }
    });
  }

  const allProductsSelected =
    props.catalog.products.length > 0 &&
    props.catalog.products.every((p) => productIds.has(p.id));
  const allPlansSelected =
    props.catalog.plans.length > 0 &&
    props.catalog.plans.every((p) => planIds.has(p.id));
  const allSubsSelected =
    props.catalog.subscriptions.length > 0 &&
    props.catalog.subscriptions.every((s) => subscriptionIds.has(s.id));

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">องค์กร / สาขา</h3>
        <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={selectAllOrgs}
            disabled={pending}
            onChange={(e) => onSelectAllOrgs(e.target.checked)}
          />
          <span>
            <strong>เลือกองค์กรทั้งหมด</strong>
            <span className="mt-1 block text-[length:var(--text-helper)] text-[var(--text-secondary)]">
              ลบทุกองค์กร/สาขาที่เกี่ยวข้อง เหลือเฉพาะ GOLDENSOFT และผู้ดูแลระบบสูงสุด
            </span>
          </span>
        </label>

        <div className="grid gap-3">
          {props.targets.map((org) => (
            <section
              key={org.id}
              className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-3"
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectAllOrgs || orgIds.has(org.id)}
                  disabled={pending || org.protected || selectAllOrgs}
                  onChange={(e) => toggleOrg(org, e.target.checked)}
                />
                <span>
                  <strong>
                    {org.displayName}{" "}
                    <span className="text-[var(--text-secondary)]">
                      ({org.customerCode})
                    </span>
                  </strong>
                  {org.protected ? (
                    <span className="mt-1 block text-[length:var(--text-helper)] text-[var(--text-secondary)]">
                      องค์กรระบบ — ไม่สามารถลบได้
                    </span>
                  ) : null}
                </span>
              </label>
              {!org.protected && org.branches.length > 0 ? (
                <ul className="mt-3 ml-7 grid gap-2">
                  {org.branches.map((branch) => (
                    <li key={branch.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={
                            selectAllOrgs ||
                            orgIds.has(org.id) ||
                            branchIds.has(branch.id)
                          }
                          disabled={
                            pending ||
                            selectAllOrgs ||
                            orgIds.has(org.id) ||
                            branch.protected
                          }
                          onChange={(e) =>
                            toggleBranch(org, branch.id, e.target.checked)
                          }
                        />
                        <span>
                          {branch.name}{" "}
                          <span className="text-[var(--text-secondary)]">
                            ({branch.code})
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">ผลิตภัณฑ์</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allProductsSelected}
              disabled={pending || props.catalog.products.length === 0}
              onChange={(e) => selectAllProducts(e.target.checked)}
            />
            เลือกทั้งหมด
          </label>
        </div>
        {props.catalog.products.length === 0 ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
            ไม่มีผลิตภัณฑ์
          </p>
        ) : (
          <ul className="grid gap-2">
            {props.catalog.products.map((product) => (
              <li key={product.id}>
                <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={productIds.has(product.id)}
                    disabled={pending}
                    onChange={(e) =>
                      toggleId(setProductIds, product.id, e.target.checked)
                    }
                  />
                  <span>
                    {product.name}{" "}
                    <span className="text-[var(--text-secondary)]">
                      ({product.code}) · แพ็กเกจ {product.planCount}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">แพ็กเกจ</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allPlansSelected}
              disabled={pending || props.catalog.plans.length === 0}
              onChange={(e) => selectAllPlans(e.target.checked)}
            />
            เลือกทั้งหมด
          </label>
        </div>
        {props.catalog.plans.length === 0 ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
            ไม่มีแพ็กเกจ
          </p>
        ) : (
          <ul className="grid gap-2">
            {props.catalog.plans.map((plan) => (
              <li key={plan.id}>
                <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={
                      planIds.has(plan.id) || productIds.has(plan.productId)
                    }
                    disabled={pending || productIds.has(plan.productId)}
                    onChange={(e) =>
                      toggleId(setPlanIds, plan.id, e.target.checked)
                    }
                  />
                  <span>
                    {plan.name}{" "}
                    <span className="text-[var(--text-secondary)]">
                      ({plan.productCode}/{plan.code})
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">การสมัครใช้บริการ</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSubsSelected}
              disabled={pending || props.catalog.subscriptions.length === 0}
              onChange={(e) => selectAllSubscriptions(e.target.checked)}
            />
            เลือกทั้งหมด
          </label>
        </div>
        {props.catalog.subscriptions.length === 0 ? (
          <p className="text-[length:var(--text-helper)] text-[var(--text-secondary)]">
            ไม่มีการสมัครใช้บริการ
          </p>
        ) : (
          <ul className="grid max-h-72 gap-2 overflow-y-auto">
            {props.catalog.subscriptions.map((sub) => (
              <li key={sub.id}>
                <label className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={subscriptionIds.has(sub.id)}
                    disabled={pending}
                    onChange={(e) =>
                      toggleId(setSubscriptionIds, sub.id, e.target.checked)
                    }
                  />
                  <span>
                    {sub.organizationName}{" "}
                    <span className="text-[var(--text-secondary)]">
                      ({sub.organizationCode}) · {sub.productCode}/
                      {sub.planCode} · {sub.statusCode}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview ? (
        <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-3 text-[length:var(--text-helper)]">
          <p className="font-semibold">
            ตัวอย่างผลลัพธ์ (
            {preview.mode === "reset_all" ? "องค์กรทั้งหมด" : "เลือกบางส่วน"})
          </p>
          <ul className="mt-2 list-disc pl-5">
            <li>องค์กร: {preview.organizations.length}</li>
            <li>สาขาเพิ่มเติม: {preview.branches.length}</li>
            <li>ผลิตภัณฑ์: {preview.products.length}</li>
            <li>แพ็กเกจ: {preview.plans.length}</li>
            <li>การสมัครใช้บริการ: {preview.subscriptions.length}</li>
            <li>โปรไฟล์ที่ไม่มีองค์กรเหลือ: {preview.orphanProfiles.length}</li>
          </ul>
          {preview.warnings.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-[var(--danger)]">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <label className="grid gap-1 text-sm">
        <span>
          พิมพ์{" "}
          <strong>{props.confirmPhrase || DATA_RESET_CONFIRM_PHRASE}</strong>{" "}
          เพื่อยืนยันการลบจริง
        </span>
        <input
          className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2"
          value={confirm}
          disabled={pending}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
        />
      </label>

      {error ? (
        <p
          className="text-[length:var(--text-helper)] text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <IconTextButton
          type="button"
          disabled={pending}
          onClick={() => run("preview")}
          label="ดูตัวอย่างก่อนลบ"
        />
        <IconTextButton
          type="button"
          disabled={
            pending ||
            confirm.trim() !==
              (props.confirmPhrase || DATA_RESET_CONFIRM_PHRASE)
          }
          onClick={() => {
            if (
              !window.confirm(
                "ยืนยันล้างข้อมูลที่เลือก? การกระทำนี้ย้อนกลับไม่ได้",
              )
            ) {
              return;
            }
            run("apply");
          }}
          label={pending ? "กำลังลบ..." : "ล้างข้อมูลที่เลือก"}
        />
      </div>
    </div>
  );
}
