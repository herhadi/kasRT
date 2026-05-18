import type { NextConfig } from "next";

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = isVercel
  ? {}
  : {
      // Use a local directory for Next.js build output in local/dev environments.
      // Keep Vercel on default ".next" so deployment output is detected correctly.
      distDir: ".next_local",
    };

export default nextConfig;
