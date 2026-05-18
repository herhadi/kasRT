import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = isVercel
  ? {}
  : {
      distDir: ".next_local",
    };

export default nextConfig;