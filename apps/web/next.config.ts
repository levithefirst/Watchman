import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Prisma and the PayBox SDK stay real runtime requires. Prisma must not be
  // bundled or its native query engine is left out of the serverless trace;
  // the PayBox SDK carries node-only crypto and is server-side only.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "@paybox-sh/sdk"],
  // pnpm workspace: dependencies live in the repo-root node_modules.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/api/**/*": ["../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*"],
  },
  // Workspace packages ship TypeScript source; Next compiles them directly.
  transpilePackages: ["@watchman/core", "@watchman/db"],
  poweredByHeader: false,
  webpack: (config) => {
    // Workspace packages use NodeNext ".js" specifiers for ".ts" files.
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
