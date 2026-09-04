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
