import { revokeProtection } from "@watchman/core";
import { json, owned, problem, store, viewOf } from "../../../../lib/server";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const found = await owned((await params).id);
  if (found instanceof Response) return found;
  const result = await revokeProtection(store, found.p, new Date());
  if (!result.ok) return problem(409, result.code, result.message);
  return json({ view: await viewOf(result.protection) });
}
