import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Prisma must NOT be bundled by webpack.
  //
  // @watchman/db is transpiled (below) because it ships TypeScript source.
  // That made webpack inline it, and with it `@prisma/client`. Once Prisma is
  // inlined there is no `require("@prisma/client")` left for Next's file
  // tracer to follow, so neither the package nor its native query engine
  // (libquery_engine-*.so.node) was copied into the serverless function. The
  // deployed lambda then threw "Prisma Client could not locate the Query
  // Engine" on the first query, which on /api/protect happened AFTER the
  // on-chain order had already been sent.
  //
  // Keeping it external leaves a real runtime require in place, which the
  // tracer follows to the engine binary. Verified by inspecting
  // .next/server/app/api/protect/route.js.nft.json for the engine.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // pnpm workspace: the packages this app needs live in the repo-root
  // node_modules, above apps/web. Without this the tracer roots itself at
  // apps/web and cannot reach them.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Belt and braces: pnpm stores the generated client under a content-hashed
  // .pnpm directory, so name it explicitly rather than relying on the tracer
  // resolving every symlink.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "../../node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client/**/*",
    ],
  },
  // @watchman/sdk and @watchman/db are internal pnpm workspace packages
  // that ship raw TypeScript source (package.json "main"/"exports" point
  // straight at src/index.ts, no build step). Next externalizes
  // node_modules (including pnpm's symlinked workspace packages) by
  // default and won't run its TS/JS loader on them unless told to, and this
  // is what makes Next compile that source directly, so there is no
  // separate "build the workspace packages first" step for Vercel to get
  // wrong or skip.
  transpilePackages: ["@watchman/sdk", "@watchman/db"],
  webpack: (config, { webpack }) => {
    // packages/sdk and packages/db use TypeScript's NodeNext convention:
    // relative imports carry an explicit ".js" extension even though the
    // actual file on disk is ".ts" (e.g. `import "./client.js"` resolving
    // to `client.ts`). tsc remaps that automatically; webpack's resolver
    // does not, unless told to try these extensions for a ".js" request.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    // @rainbow-me/rainbowkit's wallet connectors statically import a few
    // optional packages that only matter outside a browser tab: Coinbase's
    // x402 payment protocol (@x402/*, an unrelated payments feature),
    // MetaMask SDK's React Native storage backend (never used in a web
    // build), and pino's optional pretty-printer transport (WalletConnect's
    // logger falls back to plain JSON logging without it). None of these
    // paths run in this app; ignoring them is RainbowKit's own documented
    // fix for these exact "Module not found" build errors.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }),
      new webpack.IgnorePlugin({ resourceRegExp: /^@react-native-async-storage\/async-storage$/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^pino-pretty$/ }),
    );
    return config;
  },
};

export default nextConfig;
