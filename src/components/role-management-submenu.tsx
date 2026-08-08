import Link from "next/link";
import { Building2, House, Landmark, LibraryBig, Shield, UserRoundCheck } from "lucide-react";

import { getPreferredCustomerAppOrigin } from "@/lib/platform/customer-products";

import styles from "./role-management-submenu.module.css";

type ActiveView = "roles" | "standard-templates" | "customer-roles" | "assignees" | "customer-assignments";

export function RoleManagementSubmenu(props: {
  active: ActiveView;
  organizationId: string;
  platformContext: boolean;
}) {
  const context = props.platformContext ? "platform" : "organization";
  const query = `context=${context}&organizationId=${props.organizationId}`;
  const customerOrigin = getPreferredCustomerAppOrigin();
  const homeHref = customerOrigin
    ? `${customerOrigin}/auth/callback?next=${encodeURIComponent("/hr/welcome")}&entry=customer`
    : "/";
  const items = [
    { key: "home" as const, href: homeHref, label: "Home", Icon: House },
    { key: "roles" as const, href: `/roles?${query}`, label: props.platformContext ? "แพลตฟอร์ม" : "บทบาทองค์กร", Icon: Shield },
    ...(props.platformContext
      ? [{ key: "standard-templates" as const, href: `/roles/standard-templates?${query}`, label: "แม่แบบบทบาทมาตรฐาน", Icon: LibraryBig }]
      : []),
    ...(props.platformContext
      ? [{ key: "customer-roles" as const, href: `/roles/customer-organizations?${query}`, label: "บทบาทองค์กรลูกค้า", Icon: Landmark }]
      : []),
    { key: "assignees" as const, href: `/roles/assignees?${query}`, label: "ผู้ได้รับบทบาท", Icon: UserRoundCheck },
    ...(props.platformContext
      ? [{ key: "customer-assignments" as const, href: `/roles/customer-assignments?${query}`, label: "ผู้รับผิดชอบองค์กรลูกค้า", Icon: Building2 }]
      : []),
  ];

  return (
    <nav className={styles.bottomNav} aria-label="เมนูย่อยบทบาทและสิทธิ์">
      <div className={styles.bottomNavTrack}>
        {items.map(({ key, href, label, Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={props.active === key ? "page" : undefined}
            className={`gs-settings-tile gs-settings-tile--organization ${styles.item} ${props.active === key ? styles.active : ""}`}
          >
            <span className="gs-settings-tile-icon" aria-hidden="true"><Icon size={20} /></span>
            <span className="gs-settings-tile-label">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
