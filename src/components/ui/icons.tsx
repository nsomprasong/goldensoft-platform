import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg(props: IconProps & { children: ReactNode }) {
  const { size = 20, children, className, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </Svg>
  );
}

export function IconOrganization(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V6a2 2 0 0 1 2-2h6v16" />
      <path d="M12 20V10h6a2 2 0 0 1 2 2v8" />
      <path d="M8 8h.01M8 12h.01M8 16h.01M16 14h.01M16 17h.01" />
    </Svg>
  );
}

export function IconBranch(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-6-4.35-6-9a6 6 0 1 1 12 0c0 4.65-6 9-6 9Z" />
      <circle cx="12" cy="12" r="2.25" />
    </Svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 19v-1.2A3.8 3.8 0 0 0 12.2 14H7.8A3.8 3.8 0 0 0 4 17.8V19" />
      <circle cx="10" cy="8" r="3" />
      <path d="M20 19v-1.1A3 3 0 0 0 17.5 15" />
      <path d="M16.5 5.1a3 3 0 0 1 0 5.8" />
    </Svg>
  );
}

export function IconRoles(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 4.5 6.5v4.7c0 4.4 3.1 7.6 7.5 8.8 4.4-1.2 7.5-4.4 7.5-8.8V6.5L12 3Z" />
      <path d="m9.5 12 1.7 1.7 3.5-3.6" />
    </Svg>
  );
}

export function IconProducts(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
    </Svg>
  );
}

export function IconPlans(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h11M8 12h11M8 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </Svg>
  );
}

export function IconSubscription(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </Svg>
  );
}

export function IconAudit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h11M8 12h11M8 18h7" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h3l2.5-5 3 10 2.5-5H20" />
    </Svg>
  );
}

export type NavIconKey =
  | "dashboard"
  | "organization"
  | "branch"
  | "users"
  | "roles"
  | "products"
  | "plans"
  | "subscription"
  | "audit"
  | "settings"
  | "mail"
  | "plus"
  | "activity";

const NAV_ICON_BY_HREF: Record<string, NavIconKey> = {
  "/": "dashboard",
  "/organizations": "organization",
  "/branches": "branch",
  "/users": "users",
  "/roles": "roles",
  "/products": "products",
  "/plans": "plans",
  "/subscriptions": "subscription",
  "/audit-logs": "audit",
  "/settings": "settings",
  "/staff-portfolio": "organization",
};

export function NavIcon(props: {
  name: NavIconKey;
  size?: number;
  className?: string;
}) {
  const map: Record<NavIconKey, (p: IconProps) => ReactNode> = {
    dashboard: IconDashboard,
    organization: IconOrganization,
    branch: IconBranch,
    users: IconUsers,
    roles: IconRoles,
    products: IconProducts,
    plans: IconPlans,
    subscription: IconSubscription,
    audit: IconAudit,
    settings: IconSettings,
    mail: IconMail,
    plus: IconPlus,
    activity: IconActivity,
  };
  const Comp = map[props.name];
  return <>{Comp({ size: props.size, className: props.className })}</>;
}

export function navIconKeyForHref(href: string): NavIconKey {
  return NAV_ICON_BY_HREF[href] ?? "dashboard";
}
