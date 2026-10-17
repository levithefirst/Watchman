import { cookies } from "next/headers";
import { json, OPERATOR_COOKIE, operatorTokenFor, problem } from "../../lib/server";

export const dynamic = "force-dynamic";

/** Unlocks live mode for this browser. Requires WATCHMAN_OPERATOR_KEY. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  const token = typeof body?.key === "string" ? operatorTokenFor(body.key) : null;
  if (!token) return problem(403, "invalid_key", "That operator key isn't valid for this deployment.");
  (await cookies()).set(OPERATOR_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  (await cookies()).delete(OPERATOR_COOKIE);
  return json({ ok: true });
}
