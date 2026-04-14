import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** Absolute path to apps/web — fixes wrong workspace root when multiple lockfiles exist (e.g. user home + monorepo). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Dev uses `next dev --webpack`; this still applies if anyone runs Turbopack or for tooling that reads the config.
  turbopack: {
    root: projectRoot,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
