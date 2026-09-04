import { describe, expect, it } from "vitest";
import { calculateEffectiveness, quoteHedge } from "../src/hedge-engine.js";

/**
 * These tests exist to protect the numbers a user makes a financial decision
 * on. The dangerous failure here is not a crash — it is a plausible-looking
 * wrong number, so the assertions pin exact values rather than ranges.
 */

const req = (over: Partial<Parameters<typeof quoteHedge>[0]> = {}) => ({
  exposureUsd: 10_000,
  protectionPct: 0.5,
  maxPremiumUsd: 150,
  windowSeconds: 900 as const,
  ...over,
});

describe("quoteHedge — sizing", () => {
  it("sizes full requested protection under a premium cap", () => {
    const q = quoteHedge(req(), { downPrice: 0.2, contractsAvailable: 1_000 });
    expect(q.protectedAmountUsd).toBe(5_000);
    expect(q.contractsNeeded).toBe(5_000);
    expect(q.contractsToBuy).toBe(750);
    expect(q.premiumUsd).toBe(150);
    expect(q.fullyFunded).toBe(false);
  });

  it("does not exceed available contracts", () => {
    const q = quoteHedge(req({ exposureUsd: 1_000, maxPremiumUsd: 500 }), {
      downPrice: 0.1,
      contractsAvailable: 100,
    });
    expect(q.contractsToBuy).toBe(100);
    expect(q.premiumUsd).toBe(10);
  });

  it("never spends more than the premium budget", () => {
    for (const downPrice of [0.01, 0.17, 0.38, 0.5, 0.79, 0.99]) {
      const q = quoteHedge(req({ maxPremiumUsd: 250 }), { downPrice, contractsAvailable: 1e9 });
      expect(q.premiumUsd).toBeLessThanOrEqual(250);
    }
  });

  it("reports fullyFunded only when the whole requested hedge is bought", () => {
    const funded = quoteHedge(req({ maxPremiumUsd: 2_000 }), {
      downPrice: 0.38,
      contractsAvailable: 50_000,
    });
    expect(funded.contractsToBuy).toBe(5_000);
    expect(funded.premiumUsd).toBe(1_900);
    expect(funded.potentialPayoutUsd).toBe(5_000);
    expect(funded.fullyFunded).toBe(true);
    expect(funded.reason).toBeUndefined();
  });

  it("is the scenario the marketing page advertises (guards against impossible copy)", () => {
    // A 38c contract cannot deliver 5,000 contracts for $150. If anyone ever
    // writes that on a page again, this test is the reason it is wrong.
    const q = quoteHedge(req({ maxPremiumUsd: 150 }), { downPrice: 0.38, contractsAvailable: 1e6 });
    expect(q.contractsToBuy).toBe(394);
    expect(q.premiumUsd).toBeCloseTo(149.72, 2);
    expect(q.potentialPayoutUsd).toBe(394);
    expect(q.fullyFunded).toBe(false);
  });

  it("max payout always equals contracts bought — $1.00 face value per contract", () => {
    const q = quoteHedge(req({ maxPremiumUsd: 900 }), { downPrice: 0.45, contractsAvailable: 1e6 });
    expect(q.potentialPayoutUsd).toBe(q.contractsToBuy);
  });

  it("returns zero contracts (not a partial lie) when the budget buys nothing", () => {
    const q = quoteHedge(req({ maxPremiumUsd: 0.05 }), { downPrice: 0.9, contractsAvailable: 1e6 });
    expect(q.contractsToBuy).toBe(0);
    expect(q.premiumUsd).toBe(0);
    expect(q.fullyFunded).toBe(false);
    expect(q.reason).toMatch(/no valid down contracts/i);
  });

  it("returns zero when the book is empty", () => {
    const q = quoteHedge(req(), { downPrice: 0.38, contractsAvailable: 0 });
    expect(q.contractsToBuy).toBe(0);
    expect(q.premiumUsd).toBe(0);
  });
});

describe("quoteHedge — refuses nonsense input", () => {
  it("rejects a non-probability Down price", () => {
    // A binary price outside (0,1) is a broken book, not a bargain.
    expect(() => quoteHedge(req(), { downPrice: 0, contractsAvailable: 10 })).toThrow();
    expect(() => quoteHedge(req(), { downPrice: 1, contractsAvailable: 10 })).toThrow();
    expect(() => quoteHedge(req(), { downPrice: -0.2, contractsAvailable: 10 })).toThrow();
    expect(() => quoteHedge(req(), { downPrice: 1.4, contractsAvailable: 10 })).toThrow();
  });

  it("rejects protection outside 10%–100%", () => {
    expect(() => quoteHedge(req({ protectionPct: 0.05 }), { downPrice: 0.3, contractsAvailable: 10 })).toThrow();
    expect(() => quoteHedge(req({ protectionPct: 1.5 }), { downPrice: 0.3, contractsAvailable: 10 })).toThrow();
  });

  it("rejects non-finite or non-positive exposure and budget", () => {
    expect(() => quoteHedge(req({ exposureUsd: 0 }), { downPrice: 0.3, contractsAvailable: 10 })).toThrow();
    expect(() => quoteHedge(req({ exposureUsd: Number.NaN }), { downPrice: 0.3, contractsAvailable: 10 })).toThrow();
    expect(() => quoteHedge(req({ maxPremiumUsd: 0 }), { downPrice: 0.3, contractsAvailable: 10 })).toThrow();
    expect(() =>
      quoteHedge(req({ exposureUsd: Number.POSITIVE_INFINITY }), { downPrice: 0.3, contractsAvailable: 10 }),
    ).toThrow();
  });
});

describe("calculateEffectiveness — settled outcome", () => {
  it("computes receipt effectiveness from actual downside and payout", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 100, actualMovePct: -8, payoutUsd: 800 });
    expect(r.unhedgedPnlUsd).toBe(-800);
    expect(r.hedgedPnlUsd).toBe(-100);
    expect(r.netProtectionUsd).toBe(800);
    expect(r.efficiencyPct).toBe(800);
  });

  it("never claims more protection than the loss that actually occurred", () => {
    // Binary overshoot: pays 5,000 against a 300 loss. Protection is capped at
    // the real loss; the surplus is basis, not protection.
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 1_900, actualMovePct: -3, payoutUsd: 5_000 });
    expect(r.unhedgedPnlUsd).toBe(-300);
    expect(r.netProtectionUsd).toBe(300);
    expect(r.hedgedPnlUsd).toBe(2_800);
    const basis = r.hedgePayoutUsd - Math.max(0, -r.unhedgedPnlUsd);
    expect(basis).toBe(4_700);
  });

  it("counts no protection when the market went up", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 200, actualMovePct: 4, payoutUsd: 0 });
    expect(r.unhedgedPnlUsd).toBe(400);
    expect(r.netProtectionUsd).toBe(0);
    expect(r.efficiencyPct).toBe(0);
    expect(r.hedgedPnlUsd).toBe(200); // gain minus the premium spent
  });

  it("treats a losing hedge as costing exactly the premium", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 150, actualMovePct: -2, payoutUsd: 0 });
    expect(r.hedgedPnlUsd).toBe(r.unhedgedPnlUsd - 150);
    expect(r.netProtectionUsd).toBe(0);
  });

  it("clamps a negative payout rather than inventing a loss", () => {
    const r = calculateEffectiveness({ exposureUsd: 1_000, premiumUsd: 50, actualMovePct: -5, payoutUsd: -999 });
    expect(r.hedgePayoutUsd).toBe(0);
    expect(r.netProtectionUsd).toBe(0);
  });

  it("does not divide by zero when no premium was paid", () => {
    const r = calculateEffectiveness({ exposureUsd: 1_000, premiumUsd: 0, actualMovePct: -5, payoutUsd: 0 });
    expect(Number.isFinite(r.efficiencyPct)).toBe(true);
    expect(r.efficiencyPct).toBe(0);
  });

  it("keeps hedged P&L consistent with its parts for arbitrary moves", () => {
    for (const move of [-25, -8, -1.2, 0, 3.5, 12]) {
      const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 190, actualMovePct: move, payoutUsd: 500 });
      expect(r.hedgedPnlUsd).toBeCloseTo(r.unhedgedPnlUsd + r.hedgePayoutUsd - 190, 6);
    }
  });
});
