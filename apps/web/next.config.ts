import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Safely clean any stale trace file created by Next.js tracing that causes
// OneDrive reparse point EINVAL readlink errors on Windows.
try {
  const distTrace = path.join(__dirname, ".next_dist", "trace");
  if (fs.existsSync(distTrace)) {
    fs.unlinkSync(distTrace);
  }
} catch {
  // Ignore file access race conditions
}
try {
  const nextTrace = path.join(__dirname, ".next", "trace");
  if (fs.existsSync(nextTrace)) {
    fs.unlinkSync(nextTrace);
  }
} catch {
  // Ignore
}

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: ".next_dist",
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
