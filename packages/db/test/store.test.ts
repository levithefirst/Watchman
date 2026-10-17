import { advanceProtection, armProtection, type ExecutionGateway, type SwapOrder } from "@watchman/core";
import { combineQuotes } from "@watchman/core";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isUniqueViolation, PrismaStore } from "../src/store.js";

/**
 * Runs the engine against real Postgres. Skipped unless TEST_DATABASE_URL
 * points at a disposable, migrated database.
 */
const url = process.env.TEST_DATABASE_URL;
const ETH = 1_000_000_000_000_000_000n;

describe.skipIf(!url)("PrismaStore on Postgres", () => {
  const db = url ? new PrismaClient({ datasources: { db: { url } } }) : (null as unknown as PrismaClient);
  const store = new PrismaStore(db);

  beforeAll(async () => {
    await db.auditEvent.deleteMany();
    await db.protection.deleteMany();
  });
  afterAll(async () => db?.$disconnect());

  async function armedLive(ownerId: string) {
    const terms = { asset: "ETH", destinationAsset: "USDC", chain: "base", dropBps: 1000, sellBps: 2500 } as const;
    const row = await db.protection.create({ data: { ownerId, mode: "LIVE", instruction: "If ETH drops 10%, sell 25% of my ETH to USDC.", dropBps: terms.dropBps, sellBps: terms.sellBps } });
    const draft = (await store.get(row.id))!;
    const r = await armProtection(store, draft, { referencePriceCents: 400_000, referenceSources: "test", balanceWei: 2n * ETH, credentialId: "cred", credentialName: "Main", approvalMode: "autonomous", walletAddress: "0x1111111111111111111111111111111111111111", now: new Date() });
    if (!r.ok) throw new Error(r.message);
    return r.protection;
  }

  it("twenty concurrent workers on a crossed trigger create exactly one PayBox request", async () => {
    const p = await armedLive("race");
    const submits: SwapOrder[] = [];
    const gateway: ExecutionGateway = {
      label: "PayBox",
      canSign: false,
      submitSwap: async (order) => {
        submits.push(order);
        await new Promise((r) => setTimeout(r, 50));
        return { kind: "submitted", snapshot: { requestId: "33333333-3333-4333-8333-333333333333", status: "pending_approval", txHash: null, approvalUrl: null, error: null } };
      },
      getRequest: async () => ({ requestId: "33333333-3333-4333-8333-333333333333", status: "pending_approval", txHash: null, approvalUrl: null, error: null }),
      completeSignature: async () => { throw new Error("unused"); },
    };
    const deps = {
      store,
      prices: { latest: async () => combineQuotes([{ source: "t", priceCents: 350_000 }], new Date()) },
      authority: { check: async () => "granted" as const },
      gateway,
      verifier: { verify: async () => ({ kind: "pending" as const }) },
      wallet: { balanceWei: async () => 2n * ETH },
    };
    await Promise.all(Array.from({ length: 20 }, () => advanceProtection(p.id, deps)));
    expect(submits).toHaveLength(1);
    const row = await db.protection.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: "EXECUTING", stage: "PENDING_APPROVAL", sellWei: (ETH / 2n).toString() });
    const kinds = (await store.events(p.id)).map((e) => e.kind);
    expect(kinds.filter((k) => k === "TRIGGER_CROSSED")).toHaveLength(1);
    expect(kinds.filter((k) => k === "PAYBOX_SUBMITTED")).toHaveLength(1);
  });

  it("refuses a second active live protection at the database level", async () => {
    const row = await db.protection.create({ data: { ownerId: "other", mode: "LIVE", instruction: "x", dropBps: 1000, sellBps: 2500 } });
    let error: unknown = null;
    try {
      await store.transition(row.id, { status: "DRAFT" }, { status: "ARMED" });
    } catch (e) {
      error = e;
    }
    expect(isUniqueViolation(error)).toBe(true);
  });

  it("records one-shot audit events once and repeatable ones every time", async () => {
    const p = await db.protection.create({ data: { ownerId: "audit", mode: "DEMO", instruction: "x", dropBps: 1000, sellBps: 2500 } });
    await store.record(p.id, { kind: "TRIGGER_CROSSED", message: "a" });
    await store.record(p.id, { kind: "TRIGGER_CROSSED", message: "b" });
    await store.record(p.id, { kind: "MONITORING_PAUSED", message: "c" });
    await store.record(p.id, { kind: "MONITORING_PAUSED", message: "d" });
    expect((await store.events(p.id)).map((e) => e.kind)).toEqual(["TRIGGER_CROSSED", "MONITORING_PAUSED", "MONITORING_PAUSED"]);
  });
});

