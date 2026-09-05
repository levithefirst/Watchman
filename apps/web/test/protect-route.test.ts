import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the execution/persistence boundary on /api/protect.
 *
 * The incident these exist for: the route executed an on-chain IOC and only
 * then wrote to the database. When Prisma failed on Vercel, real testnet funds
 * had already moved and every link to them was destroyed, while the browser
 * was shown the raw Prisma exception including filesystem paths.
 *
 * The invariant under test is simple and absolute: an order is never sent
 * before the intent is durably recorded, and once an order IS sent its
 * transaction hash is never dropped.
 */

// ---------------------------------------------------------------- test doubles
const placeDownIOC = vi.fn();
const hedge = { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() };
const user = { upsert: vi.fn() };
const exposure = { create: vi.fn() };

vi.mock("@watchman/db", () => ({ db: { user, exposure, hedge } }));

vi.mock("@watchman/sdk", async () => {
  const actual = await vi.importActual<typeof import("@watchman/sdk")>("@watchman/sdk");
  return {
    ...actual,
    placeDownIOC,
    createWatchmanContext: vi.fn(() => ({
      exchange: {
        client: {
          fetchPrice: vi.fn(async () => ({ price: "60000" })),
          getMarketOnchain: vi.fn(async () => ({ status: 1 })),
        },
        close: vi.fn(async () => undefined),
      },
      walletAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })),
    cheapestDownQuote: vi.fn(async () => ({
      marketId: "0xmarket", symbol: "BTC-DOWN-15M", asset: "BTC", windowSeconds: 900,
      expiry: Math.floor(Date.now() / 1000) + 900, upBid: 0.6, downAsk: 0.4, contractsAvailable: 10_000,
    })),
    discoverTradingMarkets: vi.fn(async () => [{ market: { info: { marketType: "binary", marketId: "0xmarket" } } }]),
    asBinary: vi.fn(() => ({ marketId: "0xmarket" })),
  };
});

const { POST } = await import("../app/api/protect/route");

const body = (over: Record<string, unknown> = {}) => ({
  asset: "BTC", exposureUsd: 10_000, protectionPct: 0.5, windowSeconds: 900, maxPremiumUsd: 150,
  wallet: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", demo: false, requestId: "attempt-1", ...over,
});
const call = (over: Record<string, unknown> = {}) =>
  POST(new Request("http://localhost/api/protect", { method: "POST", body: JSON.stringify(body(over)) }));

const okIntent = () => {
  user.upsert.mockResolvedValue({ id: "u1" });
  exposure.create.mockResolvedValue({ id: "e1" });
  hedge.create.mockResolvedValue({ id: "h1" });
  hedge.update.mockResolvedValue({ id: "h1" });
  hedge.findUnique.mockResolvedValue(null);
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRIVATE_KEY = "0x" + "1".repeat(64);
  okIntent();
});

// ------------------------------------------------------------------ the tests
describe("/api/protect execution boundary", () => {
  it("records the intent BEFORE sending any order", async () => {
    placeDownIOC.mockResolvedValue({ hash: "0xtx", filled: 300, price: 0.4 });
    await call();
    // The hedge row must be created, and created with nothing filled or paid.
    expect(hedge.create).toHaveBeenCalled();
    const created = hedge.create.mock.calls[0][0].data;
    expect(created.status).toBe("QUOTED");
    expect(created.contractsFilled).toBe(0);
    expect(created.premiumUsd).toBe(0);
    // And it must have happened before the order went out.
    expect(hedge.create.mock.invocationCallOrder[0]).toBeLessThan(placeDownIOC.mock.invocationCallOrder[0]);
  });

  it("A. never sends an order when the database is unavailable", async () => {
    user.upsert.mockRejectedValue(new Error("Prisma Client could not locate the Query Engine"));
    const res = await call();
    // The exact regression: no funds may move when persistence is broken.
    expect(placeDownIOC).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/no order was placed|nothing was spent/i);
  });

  it("A. never leaks the Prisma exception to the browser", async () => {
    user.upsert.mockRejectedValue(new Error("Prisma Client could not locate the Query Engine at /var/task/node_modules/.prisma/client"));
    const res = await call();
    const json = await res.json();
    expect(json.error).not.toMatch(/prisma/i);
    expect(json.error).not.toMatch(/query engine/i);
    expect(json.error).not.toMatch(/node_modules|\/var\/task/);
  });

  it("B. marks the hedge FAILED when the order itself fails", async () => {
    placeDownIOC.mockRejectedValue(new Error("IOC reverted on-chain"));
    const res = await call();
    expect(res.status).toBe(502);
    const statuses = hedge.update.mock.calls.map((c) => c[0].data.status);
    expect(statuses).toContain("EXECUTING"); // danger window was recorded
    expect(statuses).toContain("FAILED");
  });

  it("C. keeps the transaction hash when persistence fails AFTER execution", async () => {
    placeDownIOC.mockResolvedValue({ hash: "0xdeadbeef", filled: 300, price: 0.4 });
    // The confirming write fails, exactly as it did in production.
    hedge.update
      .mockResolvedValueOnce({ id: "h1" })                                  // -> EXECUTING
      .mockRejectedValueOnce(new Error("Query Engine not found"))           // -> OPEN fails
      .mockResolvedValueOnce({ id: "h1" });                                 // best-effort hash save
    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(500);
    // The hash reaches the user, so "not lost" is a verifiable claim.
    expect(json.txHash).toBe("0xdeadbeef");
    expect(json.hedgeId).toBe("h1");
    expect(json.error).toMatch(/was not lost/i);
    expect(json.error).not.toMatch(/prisma|query engine/i);
    // And it was persisted on a best-effort basis for recovery.
    const hashWrites = hedge.update.mock.calls.filter((c) => c[0].data.txHash === "0xdeadbeef");
    expect(hashWrites.length).toBeGreaterThan(0);
  });

  it("C. leaves the row in EXECUTING so it is recoverable, never deleted", async () => {
    placeDownIOC.mockResolvedValue({ hash: "0xdeadbeef", filled: 300, price: 0.4 });
    hedge.update
      .mockResolvedValueOnce({ id: "h1" })
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ id: "h1" });
    await call();
    // Nothing ever removes the row: the record of spent funds must survive.
    const cleared = hedge.update.mock.calls.some((c) => c[0].data.status === "QUOTED");
    expect(cleared).toBe(false);
  });

  it("E. does not execute twice for a retried requestId", async () => {
    hedge.findUnique.mockResolvedValue({ id: "h1", txHash: "0xalready", status: "OPEN" });
    const res = await call();
    expect(placeDownIOC).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.replayed).toBe(true);
    expect(json.txHash).toBe("0xalready");
  });

  it("E. does not execute twice when a concurrent retry wins the insert race", async () => {
    const conflict = Object.assign(new Error("unique"), { code: "P2002" });
    hedge.create.mockRejectedValue(conflict);
    hedge.findUnique
      .mockResolvedValueOnce(null)                                          // pre-check: nothing yet
      .mockResolvedValueOnce({ id: "h1", txHash: "0xrace", status: "OPEN" }); // after the conflict
    const res = await call();
    expect(placeDownIOC).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.replayed).toBe(true);
    expect(json.txHash).toBe("0xrace");
  });

  it("F. records a zero fill as FAILED and still keeps the hash", async () => {
    placeDownIOC.mockResolvedValue({ hash: "0xzero", filled: 0, price: 0.4 });
    const res = await call();
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.txHash).toBe("0xzero");
    const failWrite = hedge.update.mock.calls.find((c) => c[0].data.status === "FAILED");
    expect(failWrite?.[0].data.txHash).toBe("0xzero");
  });

  it("F. persists the ACTUAL partial fill, not the requested size", async () => {
    // Asked for 375 contracts, only 120 filled at a different price.
    placeDownIOC.mockResolvedValue({ hash: "0xpartial", filled: 120, price: 0.35 });
    await call();
    const open = hedge.update.mock.calls.find((c) => c[0].data.status === "OPEN");
    expect(open?.[0].data.contractsFilled).toBe(120);
    expect(open?.[0].data.premiumUsd).toBeCloseTo(120 * 0.35, 10);
    expect(open?.[0].data.downPrice).toBe(0.35);
    expect(open?.[0].data.txHash).toBe("0xpartial");
  });

  it("demo mode never touches the chain", async () => {
    const res = await call({ demo: true, wallet: undefined });
    expect(placeDownIOC).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.simulated).toBe(true);
    expect(json.txHash).toBeNull();
  });

  it("marks EXECUTING before the order and OPEN only after it returns", async () => {
    placeDownIOC.mockResolvedValue({ hash: "0xtx", filled: 300, price: 0.4 });
    await call();
    const executing = hedge.update.mock.calls.findIndex((c) => c[0].data.status === "EXECUTING");
    const open = hedge.update.mock.calls.findIndex((c) => c[0].data.status === "OPEN");
    expect(executing).toBeGreaterThanOrEqual(0);
    expect(open).toBeGreaterThan(executing);
    expect(hedge.update.mock.invocationCallOrder[executing]).toBeLessThan(placeDownIOC.mock.invocationCallOrder[0]);
  });
});
