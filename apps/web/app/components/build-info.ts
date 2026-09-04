/**
 * Which commit is this deployment actually running?
 *
 * This exists because "is the fix live?" kept being unanswerable without
 * Vercel dashboard access — an evaluator reported stale numbers on the live
 * site while the repository was already fixed, and there was no way to tell
 * from the outside whether production was serving an older build.
 *
 * Vercel injects these at build time. Now the deployed commit is visible in
 * the footer and at /api/version, so anyone can check in one glance.
 */

const sha =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_COMMIT_SHA ??
  "";

export const COMMIT_SHA = sha ? sha.slice(0, 7) : "local";
export const COMMIT_SHA_FULL = sha || "local";

/** production | preview | development */
export const DEPLOY_ENV = process.env.VERCEL_ENV ?? "development";

/** ISO timestamp of the build that produced this bundle. */
export const BUILT_AT = new Date().toISOString();
