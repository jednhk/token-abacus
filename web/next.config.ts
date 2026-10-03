import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The IDE browser loads the dev server from 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],
  // Keep module resolution in web/ when a lockfile exists at the repo root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
