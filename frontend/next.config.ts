import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Use a local directory for Next.js build output to avoid slow network filesystem issues.
  // This directory will be created inside the project root and kept out of version control.
  distDir: ".next_local",
};

export default nextConfig;
