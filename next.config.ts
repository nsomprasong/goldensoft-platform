import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow phone/LAN access to /_next/* during local development.
  allowedDevOrigins: ["192.168.1.177"],
};

export default nextConfig;
