export interface HedgeRequest {
  exposureUsd: number;
  protectionPct: number;
  maxPremiumUsd: number;
  windowSeconds: 900 | 3600;
}

export interface HedgeQuoteInput { downPrice: number; contractsAvailable: number; }

/**
 * Which constraint actually capped the fill. "budget" and "liquidity" are the
 * two real-world reasons a user asks for $5,000 of cover and can only get
 * $200, and they call for different actions (raise the budget vs wait for a
 * deeper book), so the quote names the binding one instead of a vague
 * "partially filled".
 */
export type FillConstraint = "none" | "budget" | "liquidity";

export interface HedgeQuote {
  /** Protection requested: exposure x protectionPct. */
  protectedAmountUsd: number;
  contractsNeeded: number;
  contractsToBuy: number;
  premiumUsd: number;
  costPctOfProtected: number;
  /** Protection actually obtainable right now: contracts x $1.00 face value. */
  potentialPayoutUsd: number;
  /** Obtainable / requested, as a percentage. Never exceeds 100. */
  fillablePct: number;
  limitedBy: FillConstraint;
  fullyFunded: boolean;
  reason?: string;
}

const finitePositive = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
};

export function quoteHedge(request: HedgeRequest, input: HedgeQuoteInput): HedgeQuote {
  finitePositive(request.exposureUsd, "exposureUsd");
  finitePositive(request.maxPremiumUsd, "maxPremiumUsd");
  if (request.protectionPct < 0.1 || request.protectionPct > 1) throw new Error("protectionPct must be between 0.10 and 1.00");
  if (input.downPrice <= 0 || input.downPrice >= 1) throw new Error("downPrice must be between 0 and 1");
  const protectedAmountUsd = request.exposureUsd * request.protectionPct;
  const contractsNeeded = Math.ceil(protectedAmountUsd);
  const budgetContracts = Math.floor(request.maxPremiumUsd / input.downPrice);
  const liquidityContracts = Math.max(0, Math.floor(input.contractsAvailable));
  const contractsToBuy = Math.max(0, Math.min(contractsNeeded, budgetContracts, liquidityContracts));
  const premiumUsd = contractsToBuy * input.downPrice;
  const potentialPayoutUsd = contractsToBuy;
  const costPctOfProtected = protectedAmountUsd > 0 ? (premiumUsd / protectedAmountUsd) * 100 : 0;
  const fullyFunded = contractsToBuy >= contractsNeeded;
  const fillablePct = contractsNeeded > 0 ? Math.min(100, (contractsToBuy / contractsNeeded) * 100) : 0;
  // Whichever ceiling is lower is the one the user has to act on. Ties go to
  // liquidity: more budget would not help when the book is the shorter wall.
  const limitedBy: FillConstraint = fullyFunded ? "none" : budgetContracts < liquidityContracts ? "budget" : "liquidity";
  return {
    protectedAmountUsd,
    contractsNeeded,
    contractsToBuy,
    premiumUsd,
    costPctOfProtected,
    potentialPayoutUsd,
    fillablePct,
    limitedBy,
    fullyFunded,
    reason: fullyFunded
      ? undefined
      : limitedBy === "budget"
        ? `Your premium budget covers ${contractsToBuy.toLocaleString()} of the ${contractsNeeded.toLocaleString()} contracts this protection needs.`
        : `The Down book only has ${contractsToBuy.toLocaleString()} of the ${contractsNeeded.toLocaleString()} contracts this protection needs.`
  };
}

/**
 * Attribution for a settled hedge: how much risk the protection actually
 * removed, stated in terms that cannot be misread.
 *
 * The previous model shipped two misleading names. What it called
 * `netProtectionUsd` was gross of the premium, and what it called
 * `efficiencyPct` was payout-over-premium, which printed figures like
 * "Efficiency 800%" next to a position that still lost money. Both are
 * replaced here:
 *
 *   grossLossOffsetUsd      how much of the real loss the payout covered,
 *                           capped at the loss (a binary can pay more than
 *                           the loss, but it cannot offset more than it)
 *   lossOffsetPct           that same figure as a share of the loss, so it
 *                           is bounded at 100% by construction
 *   netHedgeContributionUsd payout minus premium: what the hedge added to
 *                           the position, which is NOT a loss offset
 *   overshootUsd            payout beyond the loss, the basis a binary
 *                           carries that a put does not
 *
 * hedgedPnlUsd remains the ultimate economic outcome.
 */
export interface HedgeEffectiveness {
  exposureUsd: number;
  premiumUsd: number;
  actualMovePct: number;
  unhedgedPnlUsd: number;
  hedgePayoutUsd: number;
  hedgedPnlUsd: number;
  grossLossOffsetUsd: number;
  lossOffsetPct: number;
  netHedgeContributionUsd: number;
  overshootUsd: number;
}

/**
 * Normalises -0 to 0. A zero exposure or a zero move otherwise yields -0,
 * which formats as "-$0.00" on a receipt and reads as a bug. NaN and every
 * other value pass through unchanged, so bad input still surfaces.
 */
const noNegativeZero = (value: number): number => value + 0;

export function calculateEffectiveness(args: { exposureUsd: number; premiumUsd: number; actualMovePct: number; payoutUsd: number }): HedgeEffectiveness {
  const unhedgedPnlUsd = noNegativeZero(args.exposureUsd * (args.actualMovePct / 100));
  // A settlement can never pay negative; clamping here keeps a bad input from
  // being read as the hedge inventing a loss.
  const hedgePayoutUsd = Math.max(0, args.payoutUsd);
  const hedgedPnlUsd = noNegativeZero(unhedgedPnlUsd + hedgePayoutUsd - args.premiumUsd);
  const loss = Math.max(0, -unhedgedPnlUsd);
  const grossLossOffsetUsd = Math.min(loss, hedgePayoutUsd);
  const lossOffsetPct = loss > 0 ? (grossLossOffsetUsd / loss) * 100 : 0;
  const netHedgeContributionUsd = hedgePayoutUsd - args.premiumUsd;
  const overshootUsd = Math.max(0, hedgePayoutUsd - loss);
  return {
    exposureUsd: args.exposureUsd,
    premiumUsd: args.premiumUsd,
    actualMovePct: args.actualMovePct,
    unhedgedPnlUsd,
    hedgePayoutUsd,
    hedgedPnlUsd,
    grossLossOffsetUsd,
    lossOffsetPct,
    netHedgeContributionUsd,
    overshootUsd,
  };
}
