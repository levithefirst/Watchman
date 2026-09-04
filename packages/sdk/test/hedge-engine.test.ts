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
    // The reason names the binding constraint rather than a generic failure,
    // so the page can tell the user what to change.
    expect(q.limitedBy).toBe("budget");
    expect(q.reason).toMatch(/premium budget covers 0 of the 5,000/i);
  });

  it("returns zero when the book is empty", () => {
    const q = quoteHedge(req(), { downPrice: 0.38, contractsAvailable: 0 });
    expect(q.contractsToBuy).toBe(0);
    expect(q.premiumUsd).toBe(0);
  });
});

describe("quoteHedge — protection capacity", () => {
  it("10. reports the obtainable share of a partially fillable request", () => {
    // Asked for $5,000 of protection, book only supports $200 of it.
    const q = quoteHedge(req({ maxPremiumUsd: 10_000 }), { downPrice: 0.4, contractsAvailable: 200 });
    expect(q.protectedAmountUsd).toBe(5_000);
    expect(q.potentialPayoutUsd).toBe(200);
    expect(q.fillablePct).toBeCloseTo(4, 6);
    expect(q.premiumUsd).toBeCloseTo(80, 6);
    expect(q.fullyFunded).toBe(false);
  });

  it("11. names the budget as the binding constraint when it is the lower ceiling", () => {
    const q = quoteHedge(req({ maxPremiumUsd: 150 }), { downPrice: 0.2, contractsAvailable: 1e6 });
    expect(q.limitedBy).toBe("budget");
    expect(q.contractsToBuy).toBe(750);
    expect(q.reason).toMatch(/premium budget/i);
  });

  it("12. names liquidity as the binding constraint when the book is the lower ceiling", () => {
    const q = quoteHedge(req({ maxPremiumUsd: 1e6 }), { downPrice: 0.2, contractsAvailable: 400 });
    expect(q.limitedBy).toBe("liquidity");
    expect(q.contractsToBuy).toBe(400);
    expect(q.reason).toMatch(/down book/i);
  });

  it("13. reports zero capacity, not a partial lie, when there is no liquidity", () => {
    const q = quoteHedge(req(), { downPrice: 0.38, contractsAvailable: 0 });
    expect(q.contractsToBuy).toBe(0);
    expect(q.potentialPayoutUsd).toBe(0);
    expect(q.premiumUsd).toBe(0);
    expect(q.fillablePct).toBe(0);
    expect(q.limitedBy).toBe("liquidity");
  });

  it("reports full capacity with no binding constraint when the whole request fills", () => {
    const q = quoteHedge(req({ maxPremiumUsd: 2_000 }), { downPrice: 0.38, contractsAvailable: 50_000 });
    expect(q.fillablePct).toBe(100);
    expect(q.limitedBy).toBe("none");
    expect(q.reason).toBeUndefined();
  });

  it("never reports more than 100% fillable", () => {
    const q = quoteHedge(req({ maxPremiumUsd: 1e9 }), { downPrice: 0.01, contractsAvailable: 1e9 });
    expect(q.fillablePct).toBe(100);
    expect(q.contractsToBuy).toBe(q.contractsNeeded);
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

describe("calculateEffectiveness — attribution", () => {
  it("is the documented worked example: partial offset", () => {
    // $10,000 exposure, $80 premium, -3% move, $200 payout.
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 80, actualMovePct: -3, payoutUsd: 200 });
    expect(r.unhedgedPnlUsd).toBe(-300);
    expect(r.hedgePayoutUsd).toBe(200);
    expect(r.hedgedPnlUsd).toBe(-180);
    expect(r.grossLossOffsetUsd).toBe(200);
    expect(r.lossOffsetPct).toBeCloseTo(66.6667, 4);
    expect(r.netHedgeContributionUsd).toBe(120);
    expect(r.overshootUsd).toBe(0);
  });

  it("is the documented worked example: payout far beyond the loss", () => {
    // The case that proves a binary is not a put. It pays 5,000 against a 300
    // loss: the loss is fully offset, and the other 4,700 is overshoot, which
    // is NOT additional loss protection.
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 1_900, actualMovePct: -3, payoutUsd: 5_000 });
    expect(r.unhedgedPnlUsd).toBe(-300);
    expect(r.grossLossOffsetUsd).toBe(300);
    expect(r.lossOffsetPct).toBe(100);
    expect(r.netHedgeContributionUsd).toBe(3_100);
    expect(r.overshootUsd).toBe(4_700);
    expect(r.hedgedPnlUsd).toBe(2_800);
  });

  it("1. reports no offset when there was no downside move to offset", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 200, actualMovePct: 4, payoutUsd: 0 });
    expect(r.unhedgedPnlUsd).toBe(400);
    expect(r.grossLossOffsetUsd).toBe(0);
    expect(r.lossOffsetPct).toBe(0);
    expect(r.overshootUsd).toBe(0);
    expect(r.netHedgeContributionUsd).toBe(-200);
    expect(r.hedgedPnlUsd).toBe(200); // gain minus the premium spent
  });

  it("2. treats a down move with no payout as costing exactly the premium", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 150, actualMovePct: -2, payoutUsd: 0 });
    expect(r.hedgedPnlUsd).toBe(r.unhedgedPnlUsd - 150);
    expect(r.grossLossOffsetUsd).toBe(0);
    expect(r.lossOffsetPct).toBe(0);
    expect(r.netHedgeContributionUsd).toBe(-150);
  });

  it("3. offsets part of the loss", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 100, actualMovePct: -8, payoutUsd: 300 });
    expect(r.unhedgedPnlUsd).toBe(-800);
    expect(r.grossLossOffsetUsd).toBe(300);
    expect(r.lossOffsetPct).toBeCloseTo(37.5, 6);
    expect(r.overshootUsd).toBe(0);
  });

  it("4. offsets the loss exactly", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 100, actualMovePct: -8, payoutUsd: 800 });
    expect(r.grossLossOffsetUsd).toBe(800);
    expect(r.lossOffsetPct).toBe(100);
    expect(r.overshootUsd).toBe(0);
    expect(r.netHedgeContributionUsd).toBe(700);
    expect(r.hedgedPnlUsd).toBe(-100); // only the premium remains
  });

  it("5. caps the offset at the loss when the payout exceeds it", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 100, actualMovePct: -1, payoutUsd: 500 });
    expect(r.unhedgedPnlUsd).toBe(-100);
    expect(r.grossLossOffsetUsd).toBe(100);
    expect(r.lossOffsetPct).toBe(100);
    expect(r.overshootUsd).toBe(400);
  });

  it("6. reports a negative contribution when the premium exceeded the payout", () => {
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 500, actualMovePct: -5, payoutUsd: 200 });
    expect(r.netHedgeContributionUsd).toBe(-300);
    // The hedge still offset real loss even though it lost money overall.
    expect(r.grossLossOffsetUsd).toBe(200);
    expect(r.lossOffsetPct).toBeCloseTo(40, 6);
  });

  it("7. handles a zero premium without dividing by zero", () => {
    const r = calculateEffectiveness({ exposureUsd: 1_000, premiumUsd: 0, actualMovePct: -5, payoutUsd: 0 });
    expect(Number.isFinite(r.lossOffsetPct)).toBe(true);
    expect(r.lossOffsetPct).toBe(0);
    expect(r.netHedgeContributionUsd).toBe(0);
  });

  it("8. handles zero exposure without producing NaN", () => {
    const r = calculateEffectiveness({ exposureUsd: 0, premiumUsd: 10, actualMovePct: -5, payoutUsd: 0 });
    expect(r.unhedgedPnlUsd).toBe(0);
    expect(r.lossOffsetPct).toBe(0);
    expect(r.grossLossOffsetUsd).toBe(0);
    expect(Number.isFinite(r.hedgedPnlUsd)).toBe(true);
    expect(r.hedgedPnlUsd).toBe(-10);
  });

  it("9. clamps a negative payout rather than inventing a loss", () => {
    const r = calculateEffectiveness({ exposureUsd: 1_000, premiumUsd: 50, actualMovePct: -5, payoutUsd: -999 });
    expect(r.hedgePayoutUsd).toBe(0);
    expect(r.grossLossOffsetUsd).toBe(0);
    expect(r.overshootUsd).toBe(0);
    expect(r.netHedgeContributionUsd).toBe(-50);
  });

  it("14. never reports a loss offset above 100%, for any payout", () => {
    for (const payout of [0, 1, 299.99, 300, 300.01, 5_000, 1e9]) {
      const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 50, actualMovePct: -3, payoutUsd: payout });
      expect(r.lossOffsetPct).toBeLessThanOrEqual(100);
      expect(r.lossOffsetPct).toBeGreaterThanOrEqual(0);
    }
  });

  it("15. never reports a gross offset larger than the actual loss", () => {
    for (const move of [-30, -12, -3, -0.5]) {
      for (const payout of [0, 100, 5_000, 1e6]) {
        const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 50, actualMovePct: move, payoutUsd: payout });
        const loss = Math.max(0, -r.unhedgedPnlUsd);
        expect(r.grossLossOffsetUsd).toBeLessThanOrEqual(loss);
        expect(r.grossLossOffsetUsd).toBeLessThanOrEqual(r.hedgePayoutUsd);
      }
    }
  });

  it("16. keeps the hedged P&L identity for arbitrary moves", () => {
    for (const move of [-25, -8, -1.2, 0, 3.5, 12]) {
      const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 190, actualMovePct: move, payoutUsd: 500 });
      expect(r.hedgedPnlUsd).toBeCloseTo(r.unhedgedPnlUsd + r.hedgePayoutUsd - 190, 6);
      // Equivalently: unhedged plus what the hedge net contributed.
      expect(r.hedgedPnlUsd).toBeCloseTo(r.unhedgedPnlUsd + r.netHedgeContributionUsd, 6);
    }
  });

  it("17. defines net hedge contribution as payout minus premium, not a loss offset", () => {
    // The distinction that must never blur: a hedge can contribute +3,100
    // while only offsetting 300 of actual loss.
    const r = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 1_900, actualMovePct: -3, payoutUsd: 5_000 });
    expect(r.netHedgeContributionUsd).toBe(r.hedgePayoutUsd - r.premiumUsd);
    expect(r.netHedgeContributionUsd).not.toBe(r.grossLossOffsetUsd);
  });

  it("18. defines overshoot as payout beyond the loss, and zero otherwise", () => {
    const under = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 50, actualMovePct: -5, payoutUsd: 200 });
    expect(under.overshootUsd).toBe(0);
    const over = calculateEffectiveness({ exposureUsd: 10_000, premiumUsd: 50, actualMovePct: -5, payoutUsd: 900 });
    expect(over.overshootUsd).toBe(400); // 900 payout against a 500 loss
    // Payout is always fully accounted for: offset + overshoot.
    expect(over.grossLossOffsetUsd + over.overshootUsd).toBe(over.hedgePayoutUsd);
  });
});
