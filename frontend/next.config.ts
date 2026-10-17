import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: ".next_dist",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
