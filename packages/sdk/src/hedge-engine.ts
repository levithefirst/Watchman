export interface HedgeRequest {
  exposureUsd: number;
  protectionPct: number;
  maxPremiumUsd: number;
  windowSeconds: 900 | 3600;
}

export interface HedgeQuoteInput { downPrice: number; contractsAvailable: number; }
export interface HedgeQuote {
  protectedAmountUsd: number;
  contractsNeeded: number;
  contractsToBuy: number;
  premiumUsd: number;
  costPctOfProtected: number;
  potentialPayoutUsd: number;
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
  const contractsToBuy = Math.max(0, Math.min(contractsNeeded, budgetContracts, Math.floor(input.contractsAvailable)));
  const premiumUsd = contractsToBuy * input.downPrice;
  const potentialPayoutUsd = contractsToBuy;
  const costPctOfProtected = protectedAmountUsd > 0 ? (premiumUsd / protectedAmountUsd) * 100 : 0;
  const fullyFunded = contractsToBuy >= contractsNeeded;
  return {
    protectedAmountUsd,
    contractsNeeded,
    contractsToBuy,
    premiumUsd,
    costPctOfProtected,
    potentialPayoutUsd,
    fullyFunded,
    reason: fullyFunded ? undefined : contractsToBuy === 0 ? "No valid Down contracts fit the premium constraint." : "Premium or available liquidity limits the requested protection."
  };
}

export interface HedgeEffectiveness {
  exposureUsd: number;
  premiumUsd: number;
  actualMovePct: number;
  unhedgedPnlUsd: number;
  hedgePayoutUsd: number;
  hedgedPnlUsd: number;
  netProtectionUsd: number;
  efficiencyPct: number;
}

export function calculateEffectiveness(args: { exposureUsd: number; premiumUsd: number; actualMovePct: number; payoutUsd: number }): HedgeEffectiveness {
  const unhedgedPnlUsd = args.exposureUsd * (args.actualMovePct / 100);
  const hedgePayoutUsd = Math.max(0, args.payoutUsd);
  const hedgedPnlUsd = unhedgedPnlUsd + hedgePayoutUsd - args.premiumUsd;
  const downsideLoss = Math.max(0, -unhedgedPnlUsd);
  const netProtectionUsd = Math.min(downsideLoss, hedgePayoutUsd);
  const efficiencyPct = args.premiumUsd > 0 ? (netProtectionUsd / args.premiumUsd) * 100 : 0;
  return { exposureUsd: args.exposureUsd, premiumUsd: args.premiumUsd, actualMovePct: args.actualMovePct, unhedgedPnlUsd, hedgePayoutUsd, hedgedPnlUsd, netProtectionUsd, efficiencyPct };
}
