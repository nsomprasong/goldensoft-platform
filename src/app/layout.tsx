import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "GoldenSoft Platform",
  description: "Central Auth and multi-tenant control plane",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/login", label: "Login" },
  { href: "/organizations", label: "Organizations" },
  { href: "/products", label: "Products" },
  { href: "/plans", label: "Plans" },
  { href: "/subscriptions", label: "Subscriptions" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-wide text-[var(--accent)]">
                GoldenSoft
              </p>
              <h1 className="text-2xl font-bold">Platform Control Plane</h1>
            </div>
            <nav className="flex flex-wrap gap-3 text-sm font-medium">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-[var(--border)] bg-white/80 px-3 py-1.5"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
