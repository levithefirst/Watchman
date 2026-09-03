import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @watchman/sdk and @watchman/db are internal pnpm workspace packages.
  // Next externalizes node_modules (including symlinked workspace
  // packages) by default; this tells it to bundle/transpile them like
  // first-party source instead, which is what makes Vercel's serverless
  // trace step reliably pick them up.
  transpilePackages: ["@watchman/sdk", "@watchman/db"],
};

export default nextConfig;
