import { advanceProtection, PublicPriceFeed, type EngineDeps, type PriceObservation } from "@watchman/core";
import { BaseRpc, createBaseVerifier, createBaseWallet, createPayboxAuthority, createPayboxGateway, payboxConfigured, payboxEnv } from "@watchman/core/live";
import { db, PrismaStore } from "@watchman/db";

/**
 * Watchman's monitor. It owns the price condition — PayBox never sees a
 * price — and contacts PayBox only for the protection that has crossed its
 * trigger, or to follow a request it already made. Demo protections are
 * driven by the web app through the same engine and are ignored here.
 */
const pollMs = Math.max(2_000, Number(process.env.WATCHMAN_POLL_MS ?? 5_000));
const log = (event: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const env = payboxEnv();
const live = payboxConfigured(env);
const rpc = new BaseRpc();
const feed = new PublicPriceFeed();
const store = new PrismaStore(db);

let observation: PriceObservation | null = null;

const deps: EngineDeps = {
  store,
  prices: { latest: async () => observation },
  authority: createPayboxAuthority(env),
  gateway: createPayboxGateway(env),
  verifier: createBaseVerifier(rpc),
  wallet: createBaseWallet(rpc),
  log,
};

let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    // Finish the tick in flight: a PayBox submission is never abandoned halfway.
    log("stopping", { signal });
    stopping = true;
  });
}

async function tick(): Promise<void> {
  observation = await feed.latest().catch(() => null);
  await db.monitorHeartbeat.upsert({
    where: { id: "live" },
    create: { id: "live", seenAt: new Date(), priceCents: observation?.priceCents ?? null, priceAt: observation?.observedAt ?? null, sources: observation?.quotes.map((q) => q.source).join(" + ") ?? null, canSign: deps.gateway.canSign },
    update: { seenAt: new Date(), priceCents: observation?.priceCents ?? null, priceAt: observation?.observedAt ?? null, sources: observation?.quotes.map((q) => q.source).join(" + ") ?? null, canSign: deps.gateway.canSign },
  });
  if (!live) return;

  const active = await db.protection.findMany({ where: { mode: "LIVE", status: { in: ["ARMED", "EXECUTING"] } }, select: { id: true }, orderBy: { createdAt: "asc" } });
  for (const { id } of active) {
    try {
      const after = await advanceProtection(id, deps);
      if (after && (after.status !== "ARMED" || after.pauseReason)) log("protection", { id, status: after.status, stage: after.stage, pauseReason: after.pauseReason });
    } catch (error) {
      log("advance_failed", { id, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function main(): Promise<void> {
  log("started", { pollMs, paybox: live ? "configured" : "not configured", signer: deps.gateway.canSign ? "paired" : "none" });
  if (!live) log("paybox_missing", { detail: "PAYBOX_API_KEY is not set. Reporting heartbeat and price only; no live protection can execute." });
  while (!stopping) {
    const started = Date.now();
    try {
      await tick();
    } catch (error) {
      log("tick_failed", { error: error instanceof Error ? error.message : String(error) });
    }
    await sleep(Math.max(250, pollMs - (Date.now() - started)));
  }
  await db.$disconnect();
  log("stopped");
}

void main();
