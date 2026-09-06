import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tUSDC balance must never lie.
 *
 * Two tester-reported failures live here. The balance sat on "checking…"
 * forever whenever the venue was unreachable, because it shared a try with
 * market discovery even though balanceOf needs no market data. And a failed
 * lookup was reported as 0, telling a tester holding 50 tUSDC that they held
 * nothing. A verified zero and a failed read must be distinguishable.
 */

const cheapestDownQuote = vi.fn();
const getTUSDCBalance = vi.fn();

vi.mock("@watchman/sdk", async () => {
  const actual = await vi.importActual<typeof import("@watchman/sdk")>("@watchman/sdk");
  return {
    ...actual,
    cheapestDownQuote,
    getTUSDCBalance,
    createWatchmanContext: vi.fn(() => ({
      exchange: { close: vi.fn(async () => undefined) },
      walletAddress: undefined,
    })),
  };
});

const { POST } = await import("../app/api/quote/route");

const WALLET = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const call = (over: Record<string, unknown> = {}) =>
  POST(new Request("http://localhost/api/quote", {
    method: "POST",
    body: JSON.stringify({ asset: "BTC", exposureUsd: 10_000, protectionPct: 0.5, windowSeconds: 3600, maxPremiumUsd: 150, wallet: WALLET, ...over }),
  }));

const aQuote = { marketId: "0xm", symbol: "BTC-DOWN-1H", asset: "BTC", windowSeconds: 3600, expiry: Math.floor(Date.now() / 1000) + 3600, upBid: 0.6, downAsk: 0.4, contractsAvailable: 10_000 };

beforeEach(() => {
  vi.clearAllMocks();
  cheapestDownQuote.mockResolvedValue(aQuote);
  getTUSDCBalance.mockResolvedValue(50);
});

describe("/api/quote tUSDC balance", () => {
  it("reports a verified non-zero balance", async () => {
    const json = await (await call()).json();
    expect(json.balance).toMatchObject({ status: "ok", value: 50 });
  });

  it("still reports a verified ZERO balance as zero", async () => {
    // A real empty wallet must not be hidden behind an error state.
    getTUSDCBalance.mockResolvedValue(0);
    const json = await (await call()).json();
    expect(json.balance).toMatchObject({ status: "ok", value: 0 });
  });

  it("reports a FAILED lookup as unavailable, never as zero", async () => {
    getTUSDCBalance.mockRejectedValue(new Error("rpc readContract balanceOf failed"));
    const json = await (await call()).json();
    expect(json.balance.status).toBe("unavailable");
    expect(json.balance.value).toBeUndefined();
  });

  it("names the token so a wrong-contract read is diagnosable", async () => {
    const json = await (await call()).json();
    expect(json.balance.token).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("still returns the balance when the venue is unreachable", async () => {
    // The regression that left the UI on "checking…" forever.
    cheapestDownQuote.mockRejectedValue(new Error("this operation needs chain access"));
    const res = await call();
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.reason).toBe("unavailable");
    expect(json.balance).toMatchObject({ status: "ok", value: 50 });
  });

  it("still returns a quote when the balance lookup fails", async () => {
    // The reverse coupling: a balance failure must not kill the quote.
    getTUSDCBalance.mockRejectedValue(new Error("balanceOf reverted"));
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.quote).toBeTruthy();
    expect(json.balance.status).toBe("unavailable");
  });

  it("omits the balance entirely when no wallet is connected", async () => {
    const json = await (await call({ wallet: undefined })).json();
    expect(json.balance).toBeUndefined();
    expect(getTUSDCBalance).not.toHaveBeenCalled();
  });

  it("keeps an empty order book distinct from an unreachable venue", async () => {
    cheapestDownQuote.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reason).toBe("no-liquidity");
    expect(json.quote).toBeNull();
  });

  it("never leaks infrastructure detail when the venue fails", async () => {
    cheapestDownQuote.mockRejectedValue(new Error("connect ECONNREFUSED /var/task/node_modules/.prisma"));
    const json = await (await call()).json();
    expect(json.error).not.toMatch(/node_modules|\/var\/task|prisma|ECONN/i);
  });
});
