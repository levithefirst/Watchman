import { describe, expect, it } from "vitest";
import { combineQuotes, demoPriceCents, PublicPriceFeed } from "../src/price.js";
import { evaluateTrigger, type TriggerInput } from "../src/trigger.js";

const now = new Date("2026-10-17T12:00:00Z");
const obs = (priceCents: number, ageMs = 1_000, quotes?: number[]) =>
  combineQuotes((quotes ?? [priceCents]).map((c, i) => ({ source: `s${i}`, priceCents: c })), new Date(now.getTime() - ageMs));

const base = (over: Partial<TriggerInput> = {}): TriggerInput => ({
  status: "ARMED",
  triggeredAt: null,
  triggerPriceCents: 360_000,
  observation: obs(380_000),
  permission: "granted",
  now,
  maxPriceAgeMs: 30_000,
  ...over,
});

describe("evaluateTrigger", () => {
  it("triggers exactly at the threshold", () => {
    expect(evaluateTrigger(base({ observation: obs(360_000) }))).toEqual({ decision: "trigger", priceCents: 360_000 });
  });

  it("triggers below the threshold", () => {
    expect(evaluateTrigger(base({ observation: obs(359_999) })).decision).toBe("trigger");
  });

  it("holds above the threshold and reports distance", () => {
    const d = evaluateTrigger(base({ observation: obs(360_001) }));
    expect(d.decision).toBe("hold");
    const far = evaluateTrigger(base({ observation: obs(384_200) }));
    expect(far).toMatchObject({ decision: "hold", distanceBps: 629 });
  });

  it("pauses on a stale price, even one far below the trigger", () => {
    expect(evaluateTrigger(base({ observation: obs(100_000, 31_000) }))).toEqual({ decision: "pause", reason: "price_stale" });
  });

  it("pauses when no price is available", () => {
    expect(evaluateTrigger(base({ observation: null }))).toEqual({ decision: "pause", reason: "price_unavailable" });
  });

  it("pauses on a price from the future", () => {
    expect(evaluateTrigger(base({ observation: obs(100_000, -60_000) }))).toEqual({ decision: "pause", reason: "price_stale" });
  });

  it("pauses on an invalid price", () => {
    const bad = { ...obs(380_000)!, priceCents: Number.NaN };
    expect(evaluateTrigger(base({ observation: bad }))).toEqual({ decision: "pause", reason: "price_invalid" });
  });

  it("pauses when sources disagree", () => {
    expect(evaluateTrigger(base({ observation: obs(0, 1_000, [350_000, 380_000]) }))).toEqual({ decision: "pause", reason: "price_disagreement" });
  });

  it("acts on the highest source, so one low print can't trigger", () => {
    expect(evaluateTrigger(base({ observation: obs(0, 1_000, [359_000, 361_000]) })).decision).toBe("hold");
    expect(evaluateTrigger(base({ observation: obs(0, 1_000, [359_000, 359_500]) })).decision).toBe("trigger");
  });

  it("never triggers a revoked permission", () => {
    expect(evaluateTrigger(base({ permission: "revoked", observation: obs(100_000) }))).toEqual({ decision: "pause", reason: "permission_revoked" });
  });

  it("ignores protections that are not armed", () => {
    for (const status of ["DRAFT", "REVOKED", "EXECUTING", "COMPLETED", "FAILED"]) {
      expect(evaluateTrigger(base({ status, observation: obs(100_000) })).decision).toBe("ignore");
    }
  });

  it("ignores an already-triggered protection", () => {
    expect(evaluateTrigger(base({ triggeredAt: now, observation: obs(100_000) }))).toEqual({ decision: "ignore", reason: "already_triggered" });
  });
});

describe("price feed", () => {
  it("drops insane quotes", () => {
    expect(combineQuotes([{ source: "a", priceCents: 0 }, { source: "b", priceCents: 5 }], now)).toBeNull();
    expect(combineQuotes([{ source: "a", priceCents: 380_000 }, { source: "b", priceCents: 1 }], now)?.quotes).toHaveLength(1);
  });

  it("reads Coinbase and Kraken and survives one failing", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes("coinbase")) return new Response(JSON.stringify({ data: { amount: "3842.17" } }));
      return new Response("bad gateway", { status: 502 });
    }) as unknown as typeof fetch;
    const o = await new PublicPriceFeed({ fetchImpl, now: () => now }).latest();
    expect(o).toMatchObject({ priceCents: 384_217, quotes: [{ source: "Coinbase", priceCents: 384_217 }] });
  });

  it("returns null when every source fails", async () => {
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await new PublicPriceFeed({ fetchImpl }).latest()).toBeNull();
  });

  it("demo market stays well above a 10% trigger until a drop, then crosses it", () => {
    const armedAt = new Date(0);
    for (let s = 0; s < 600; s += 3) {
      const p = demoPriceCents({ referenceCents: 400_000, armedAt, dropAt: null, now: new Date(s * 1000) });
      expect(p).toBeGreaterThan(400_000 * 0.98);
    }
    const dropAt = new Date(60_000);
    expect(demoPriceCents({ referenceCents: 400_000, armedAt, dropAt, now: new Date(60_000 + 12_000) })).toBeLessThan(360_000);
  });
});
