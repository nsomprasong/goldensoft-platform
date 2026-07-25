import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "GoldenSoft Platform",
  description: "แพลตฟอร์มควบคุมกลาง GoldenSoft",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
