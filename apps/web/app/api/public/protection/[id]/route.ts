import { advanceProtection } from "@watchman/core";
import { demoDeps, json, problem, store, viewOf } from "../../../../lib/server";

export const dynamic = "force-dynamic";

/**
 * Read-only status for one protection, by its unguessable id. This is what
 * the Watchman PayBox plugin reads; it can observe a protection, never act on it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = (await params).id;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return problem(404, "not_found", "No protection with that id.");
  const p = await store.get(id);
  if (!p) return problem(404, "not_found", "No protection with that id.");
  const active = p.mode === "DEMO" && (p.status === "ARMED" || p.status === "EXECUTING");
  const v = await viewOf((active ? await advanceProtection(p.id, demoDeps()) : null) ?? p);
  return json({
    id: v.id,
    mode: v.mode,
    status: v.status,
    stage: v.stage,
    instruction: v.instruction,
    prices: { reference: v.prices.reference, trigger: v.prices.trigger, current: v.prices.current, distance: v.prices.distance, updatedAt: v.prices.updatedAt },
    health: v.health,
    execution: v.execution && { headline: v.execution.headline, requestId: v.execution.requestId, payboxStatus: v.execution.payboxStatus },
    receipt: v.receipt,
    failure: v.failure && { title: v.failure.title, message: v.failure.message, fundsMoved: v.failure.fundsMoved },
  });
}
