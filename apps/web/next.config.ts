import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @watchman/sdk and @watchman/db are internal pnpm workspace packages
  // that ship raw TypeScript source (package.json "main"/"exports" point
  // straight at src/index.ts, no build step). Next externalizes
  // node_modules (including pnpm's symlinked workspace packages) by
  // default and won't run its TS/JS loader on them unless told to — this
  // is what makes Next compile that source directly, so there is no
  // separate "build the workspace packages first" step for Vercel to get
  // wrong or skip.
  transpilePackages: ["@watchman/sdk", "@watchman/db"],
  webpack: (config) => {
    // packages/sdk and packages/db use TypeScript's NodeNext convention:
    // relative imports carry an explicit ".js" extension even though the
    // actual file on disk is ".ts" (e.g. `import "./client.js"` resolving
    // to `client.ts`). tsc remaps that automatically; webpack's resolver
    // does not, unless told to try these extensions for a ".js" request.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
