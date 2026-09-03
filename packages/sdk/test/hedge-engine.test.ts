import { describe, expect, it } from "vitest";
import { calculateEffectiveness, quoteHedge } from "../src/hedge-engine.js";

describe("Watchman hedge engine", () => {
  it("sizes full requested protection under a premium cap", () => {
    const q = quoteHedge({ exposureUsd: 10_000, protectionPct: 0.5, maxPremiumUsd: 150, windowSeconds: 900 }, { downPrice: 0.2, contractsAvailable: 1_000 });
    expect(q.protectedAmountUsd).toBe(5_000);
    expect(q.contractsNeeded).toBe(5_000);
    expect(q.contractsToBuy).toBe(750);
    expect(q.premiumUsd).toBe(150);
    expect(q.fullyFunded).toBe(false);
  });

  it("does not exceed available contracts", () => {
    const q = quoteHedge({ exposureUsd: 1_000, protectionPct: 0.5, maxPremiumUsd: 500, windowSeconds: 900 }, { downPrice: 0.1, contractsAvailable: 100 });
    expect(q.contractsToBuy).toBe(100);
    expect(q.premiumUsd).toBe(10);
  });

  it("computes receipt effectiveness from actual downside and payout", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 100, actualMovePct: -8, payoutUsd: 800 });
    expect(r.unhedgedPnlUsd).toBe(-800);
    expect(r.hedgedPnlUsd).toBe(-100);
    expect(r.netProtectionUsd).toBe(800);
    expect(r.efficiencyPct).toBe(800);
  });
});
