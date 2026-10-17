import { current, json, owned, problem, store, viewOf } from "../../../../lib/server";

export const dynamic = "force-dynamic";

/** Demo only: starts the simulated market's fall. It never touches a live protection. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const found = await owned((await params).id);
  if (found instanceof Response) return found;
  const { p, ownerId } = found;
  if (p.mode !== "DEMO") return problem(403, "live_protection", "Market simulation is only available in demo mode.");
  if (p.status !== "ARMED") return problem(409, "not_armed", "The simulated drop only applies to an armed protection.");
  await store.transition(p.id, { status: "ARMED", mode: "DEMO", demoDropAt: null }, { demoDropAt: new Date() });
  const next = await current(ownerId);
  return json({ view: next ? await viewOf(next) : null });
}
