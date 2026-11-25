import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Safely clean any stale trace or package.json files created by Next.js
// that acquire OneDrive reparse point EINVAL readlink attributes on Windows.
[
  ".next_dist/trace",
  ".next/trace",
  ".next_dist/package.json",
  ".next/package.json",
].forEach((rel) => {
  try {
    const p = path.join(__dirname, rel);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch {
    // Ignore file access race conditions
  }
});

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: ".next_dist",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
