import { current, json, problem, resolveMode, sessionId, viewOf } from "../../lib/server";

export const dynamic = "force-dynamic";

/** The visitor's current protection, advanced to now. */
export async function GET(): Promise<Response> {
  const ownerId = await sessionId();
  if (!ownerId) return problem(401, "no_session", "Your session expired. Reload the page to continue.");
  const [p, mode] = await Promise.all([current(ownerId), resolveMode()]);
  return json({ view: p ? await viewOf(p) : null, mode: mode.mode });
}
