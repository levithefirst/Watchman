import { quoteHedge, calculateEffectiveness } from "@watchman/sdk";

/**
 * The numbers shown on the marketing page are COMPUTED BY THE REAL ENGINE,
 * not hand-written.
 *
 * This exists because hand-written mockup figures drifted into something
 * mathematically impossible: the page simultaneously claimed a 38¢ contract
 * price, 5,000 contracts and a $150 premium (which implies a 3¢ price), plus a
 * $5,000 payout on a $150 premium — a 33x return on a ~38% probability event.
 *
 * Deriving the showcase from `quoteHedge`/`calculateEffectiveness` means the
 * landing page cannot state a number the product would not actually produce.
 * If the engine changes, the page changes with it.
 */

/** A representative live Down price. Binary contracts trade in [0,1). */
export const SHOWCASE_DOWN_PRICE = 0.38;

export const SHOWCASE_INPUT = {
  exposureUsd: 10_000,
  /** Fraction of exposure we want the hedge to be able to pay out. */
  protectionPct: 0.5,
  /**
   * Budget sized so this example is actually fillable. Covering $5,000 of
   * payout at 38¢ genuinely costs ~$1,900 — that is what a binary downside
   * event costs, and the page says so rather than implying it is cheap.
   */
  maxPremiumUsd: 2_000,
  windowSeconds: 900 as const,
};

export const SHOWCASE_QUOTE = quoteHedge(SHOWCASE_INPUT, {
  downPrice: SHOWCASE_DOWN_PRICE,
  contractsAvailable: 50_000,
});

/** The settled outcome for a −3.00% move on that same position. */
export const SHOWCASE_MOVE_PCT = -3;

export const SHOWCASE_RESULT = calculateEffectiveness({
  exposureUsd: SHOWCASE_INPUT.exposureUsd,
  premiumUsd: SHOWCASE_QUOTE.premiumUsd,
  actualMovePct: SHOWCASE_MOVE_PCT,
  payoutUsd: SHOWCASE_QUOTE.potentialPayoutUsd,
});

/**
 * Basis difference: what the binary actually paid, minus the loss it was
 * bought to cover. The single number that says a binary is not a put.
 */
export const SHOWCASE_BASIS =
  SHOWCASE_RESULT.hedgePayoutUsd - Math.max(0, -SHOWCASE_RESULT.unhedgedPnlUsd);
