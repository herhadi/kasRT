import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = isVercel
  ? {}
  : {
      distDir: ".next_local",
      // Next.js dev blocks cross-origin HMR/resource requests by default.
      // Allow access from the current LAN address for device testing.
      allowedDevOrigins: ["10.12.2.23"],
    };

export default nextConfig;
