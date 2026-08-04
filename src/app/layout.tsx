import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { NavigationPending } from "@/components/navigation-pending";

import "./globals.css";
import "./shell-responsive.css";

export const metadata: Metadata = {
  title: "GoldenSoft Platform",
  description: "แพลตฟอร์มควบคุมกลาง GoldenSoft",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Chrome/iPad (and similar) may inject attrs like __gcrremoteframetoken
    // onto the root html element before React hydrates.
    <html lang="th" suppressHydrationWarning>
      <body className="antialiased">
        <Suspense fallback={null}>
          <NavigationPending />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
