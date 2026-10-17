import { formatUsd, parseInstruction, triggerPriceFor } from "@watchman/core";
import { db } from "@watchman/db";
import { json, livePrice, problem, resolveMode, sessionId, store, viewOf } from "../../../lib/server";

export const dynamic = "force-dynamic";

/**
 * Natural language → deterministic policy, saved as an editable draft.
 * No model is involved: the same sentence always compiles to the same terms.
 */
export async function POST(request: Request): Promise<Response> {
  const ownerId = await sessionId();
  if (!ownerId) return problem(401, "no_session", "Your session expired. Reload the page to continue.");
  const body = (await request.json().catch(() => null)) as { instruction?: unknown } | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";

  const parsed = parseInstruction(instruction);
  if (!parsed.ok) return problem(422, parsed.code, parsed.message);

  const active = await db.protection.findFirst({ where: { ownerId, status: { in: ["ARMED", "EXECUTING"] } }, select: { id: true } });
  if (active) return problem(409, "active_exists", "You already have an active protection. Revoke it before creating another.");

  const { mode } = await resolveMode();
  const [draft, observation] = await Promise.all([
    db.$transaction(async (tx) => {
      await tx.protection.deleteMany({ where: { ownerId, status: "DRAFT" } });
      return tx.protection.create({ data: { ownerId, mode, instruction: instruction.trim(), dropBps: parsed.terms.dropBps, sellBps: parsed.terms.sellBps } });
    }),
    livePrice(),
  ]);
  await store.record(draft.id, { kind: "POLICY_COMPILED", message: `Compiled “${instruction.trim()}” into a fixed policy.` });

  const p = (await store.get(draft.id))!;
  return json({
    view: await viewOf(p),
    preview: observation
      ? { price: formatUsd(observation.priceCents), trigger: formatUsd(triggerPriceFor(observation.priceCents, parsed.terms.dropBps)), sources: observation.quotes.map((q) => q.source).join(" + ") }
      : null,
  });
}
