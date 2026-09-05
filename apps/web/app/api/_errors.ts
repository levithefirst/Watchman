/**
 * Keeps server internals out of the browser.
 *
 * A raw `error.message` used to be returned from every route. When Prisma
 * could not locate its query engine on Vercel, the UI rendered the whole
 * exception including filesystem and node_modules paths.
 *
 * Venue errors ("market is no longer Trading") are genuinely useful to show,
 * so messages are allowed through only when they carry no infrastructure
 * detail. Anything else collapses to a fixed fallback, and the real error is
 * logged server-side for operators.
 */

/** Anything matching this is infrastructure detail, never shown to a user. */
const UNSAFE = [
  /node_modules/i,
  /prisma/i,
  /query engine/i,
  /\/var\//i,
  /\/tmp\//i,
  /\/app\//,
  /\/home\//,
  /\/task\//i,
  /[A-Za-z]:\\/,
  /\bat\s+\w+\s+\(/,       // stack frame
  /\.(js|ts|node|so)\b/i,  // file names
  /DATABASE_URL|PRIVATE_KEY|postgres(ql)?:\/\//i,
  /\bECONN|\bENOENT|\bEACCES/i,
];

/**
 * Returns the message only when it is safe to show, otherwise `fallback`.
 * Also caps length so a huge dump cannot be pushed through.
 */
export const safeMessage = (error: unknown, fallback: string): string => {
  const raw = error instanceof Error ? error.message : "";
  if (!raw || raw.length > 300) return fallback;
  if (UNSAFE.some((pattern) => pattern.test(raw))) return fallback;
  return raw;
};

/** Structured server-side log. The full error stays here, never in a response. */
export const logApiError = (event: string, error: unknown, context: Record<string, unknown> = {}): void => {
  console.error(JSON.stringify({
    event,
    ...context,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }));
};
