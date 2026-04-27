import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Use a local directory for Next.js build output to avoid slow network filesystem issues.
  // This directory will be created inside the frontend directory (relative to next.config.ts location).
  distDir: ".next_local",
};

export default nextConfig;
