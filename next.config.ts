import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    output: "standalone",
    // Dev and production builds must not write into the same directory.
    // Otherwise a concurrent build can remove Turbopack's temporary manifests.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    // Allow phone/LAN access to /_next/* during local development.
    allowedDevOrigins: ["192.168.1.177"],
  };
}
