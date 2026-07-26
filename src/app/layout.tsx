import type { Metadata, Viewport } from "next";
import { Anuphan, Prompt } from "next/font/google";
import { Suspense } from "react";

import { NavigationPending } from "@/components/navigation-pending";

import "./globals.css";

const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-anuphan",
  display: "swap",
});

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-prompt",
  display: "swap",
});

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
      <body className={`${anuphan.variable} ${prompt.variable} antialiased`}>
        <Suspense fallback={null}>
          <NavigationPending />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
