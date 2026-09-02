import { db } from "@watchman/db";
import { calculateEffectiveness, cheapestDownQuote, createWatchmanContext, discoverTradingMarkets, placeDownIOC, quoteHedge, redeem, COLLATERAL_DECIMALS } from "@watchman/sdk";

const intervalMs = Number(process.env.SETTLEMENT_POLL_MS ?? 10_000);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
interface ResolutionPrice { numericValue: string; decimals: number; voided: boolean }
interface MarketState { expiry: bigint; decimals: number; outcomeToken: `0x${string}`; yesId: bigint; noId: bigint; winningOutcome: number; isResolved: boolean; isVoided: boolean }
const toNumber = (value: unknown): number => { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new Error("Expected a finite numeric oracle value"); return parsed; };
const resolutionMovePct = (resolution: ResolutionPrice, entryPrice: number): number => { if (resolution.voided || entryPrice <= 0) return 0; const closePrice = toNumber(resolution.numericValue) / 10 ** resolution.decimals; return closePrice > 0 ? ((closePrice - entryPrice) / entryPrice) * 100 : 0; };
const payoutFor = (amount: bigint, decimals: number, onchain: MarketState, settlementFeeBps: bigint): number => { const units = Number(amount) / 10 ** decimals; if (onchain.isVoided) return units / 2; if (!onchain.isResolved) return 0; return units * Math.max(0, 1 - Number(settlementFeeBps) / 10_000); };

async function settleOne(hedge: Awaited<ReturnType<typeof db.hedge.findMany>>[number]): Promise<void> {
  const ctx = createWatchmanContext(Boolean(process.env.PRIVATE_KEY));
  try {
    const onchain = await ctx.exchange.client.getMarketOnchain(hedge.marketId as `0x${string}`);
    const state: MarketState = { expiry: onchain.expiry, decimals: onchain.decimals, outcomeToken: onchain.outcomeToken, yesId: onchain.yesId, noId: onchain.noId, winningOutcome: onchain.winningOutcome, isResolved: onchain.isResolved, isVoided: onchain.isVoided };
    if (!state.isResolved && !state.isVoided) return;
    const resolution = await ctx.exchange.client.getOnchainResolutionPrice(hedge.marketId);
    const entryPrice = Number(hedge.exposure?.entryPrice ?? 0);
    const actualMovePct = resolutionMovePct(resolution, entryPrice);
    const settlementFees = await ctx.exchange.client.getMarketFees(hedge.marketId);
    const feeBps = BigInt(settlementFees?.settlementFeeBps ?? 0);
    let payoutUsd = 0;
    if (process.env.PRIVATE_KEY && ctx.walletAddress) {
      const heldYes = await ctx.exchange.client.getOutcomeBalance({ outcomeToken: state.outcomeToken, account: ctx.walletAddress, id: state.yesId });
      const heldNo = await ctx.exchange.client.getOutcomeBalance({ outcomeToken: state.outcomeToken, account: ctx.walletAddress, id: state.noId });
      const claimable: Array<{ outcome: 0 | 1; amount: bigint }> = [];
      if (state.isVoided) { if (heldYes > 0n) claimable.push({ outcome: 0, amount: heldYes }); if (heldNo > 0n) claimable.push({ outcome: 1, amount: heldNo }); }
      else if (state.winningOutcome === 1 && heldNo > 0n) claimable.push({ outcome: 1, amount: heldNo });
      else if (state.winningOutcome === 0 && heldYes > 0n) claimable.push({ outcome: 0, amount: heldYes });
      for (const position of claimable) { payoutUsd += payoutFor(position.amount, state.decimals || COLLATERAL_DECIMALS, state, feeBps); await redeem(ctx, hedge.marketId as `0x${string}`, position.outcome, position.amount); }
    } else payoutUsd = state.isVoided ? Number(hedge.contractsFilled) / 2 : state.winningOutcome === 1 ? Number(hedge.contractsFilled) * Math.max(0, 1 - Number(feeBps) / 10_000) : 0;
    const effectiveness = calculateEffectiveness({ exposureUsd: Number(hedge.exposureUsd), premiumUsd: Number(hedge.premiumUsd), actualMovePct, payoutUsd });
    await db.$transaction([
      db.receipt.upsert({ where: { hedgeId: hedge.id }, update: {}, create: { hedgeId: hedge.id, exposureUsd: effectiveness.exposureUsd, premiumUsd: effectiveness.premiumUsd, actualMovePct: effectiveness.actualMovePct, unhedgedPnlUsd: effectiveness.unhedgedPnlUsd, hedgedPnlUsd: effectiveness.hedgedPnlUsd, payoutUsd: effectiveness.hedgePayoutUsd, netProtectionUsd: effectiveness.netProtectionUsd, efficiencyPct: effectiveness.efficiencyPct } }),
      db.hedge.update({ where: { id: hedge.id }, data: { status: "REDEEMED", settledAt: new Date(), redeemedAt: process.env.PRIVATE_KEY ? new Date() : null } }),
    ]);
    console.log(JSON.stringify({ event: "hedge_settled", hedgeId: hedge.id, marketId: hedge.marketId, payoutUsd, actualMovePct, efficiencyPct: effectiveness.efficiencyPct }));
  } finally { await ctx.exchange.close().catch(() => undefined); }
}

async function settleOpenHedges(): Promise<void> {
  const candidates = await db.hedge.findMany({ where: { status: { in: ["OPEN", "SETTLING"] } }, include: { exposure: true }, orderBy: { expiry: "asc" }, take: 50 });
  for (const hedge of candidates) {
    const lock = await db.hedge.updateMany({ where: { id: hedge.id, status: { in: ["OPEN", "SETTLING"] } }, data: { status: "SETTLING" } });
    if (lock.count !== 1) continue;
    try { await settleOne(hedge); } catch (error) { await db.hedge.update({ where: { id: hedge.id }, data: { status: "OPEN" } }).catch(() => undefined); console.error(JSON.stringify({ event: "hedge_settlement_retry", hedgeId: hedge.id, error: error instanceof Error ? error.message : "unknown error" })); }
  }
}

async function executePolicies(): Promise<void> {
  const policies = await db.policy.findMany({ where: { status: "ACTIVE" }, include: { user: true }, take: 50 });
  if (policies.length === 0) return;
  const ctx = createWatchmanContext(Boolean(process.env.PRIVATE_KEY));
  try {
    for (const policy of policies) {
      const exposure = await db.exposure.findFirst({ where: { userId: policy.userId, asset: policy.asset }, orderBy: { createdAt: "desc" } });
      if (!exposure) continue;
      const existing = await db.hedge.findFirst({ where: { userId: policy.userId, asset: policy.asset, status: { in: ["OPEN", "SETTLING"] } } });
      if (existing) continue;
      const quote = await cheapestDownQuote(ctx, policy.asset, policy.windowSeconds as 900 | 3600);
      if (!quote) continue;
      const sized = quoteHedge({ exposureUsd: Number(exposure.amount), protectionPct: Number(policy.protectionPct), maxPremiumUsd: Number(policy.maxPremiumUsd), windowSeconds: policy.windowSeconds as 900 | 3600 }, { downPrice: quote.downAsk, contractsAvailable: quote.contractsAvailable });
      if (sized.contractsToBuy <= 0) continue;
      const market = (await discoverTradingMarkets(ctx, policy.asset)).find((candidate) => candidate.market.info.marketId.toLowerCase() === quote.marketId.toLowerCase());
      if (!market) continue;
      const fresh = await ctx.exchange.client.getMarketOnchain(quote.marketId);
      if (fresh.status !== 1) continue;
      const isDemo = policy.user.demo;
      let filled = sized.contractsToBuy;
      let price = quote.downAsk;
      let txHash: string | undefined;
      if (!isDemo && process.env.PRIVATE_KEY) {
        if (!ctx.walletAddress || policy.user.wallet.toLowerCase() !== ctx.walletAddress.toLowerCase()) continue;
        const placed = await placeDownIOC(ctx, market, quote.downAsk, sized.contractsToBuy);
        filled = placed.filled; price = placed.price; txHash = placed.hash;
        if (filled <= 0) continue;
      }
      await db.hedge.create({ data: { userId: policy.userId, exposureId: exposure.id, asset: policy.asset, marketId: quote.marketId, marketSymbol: quote.symbol, windowSeconds: policy.windowSeconds, protectionPct: policy.protectionPct, exposureUsd: exposure.amount, protectedUsd: sized.protectedAmountUsd, contractsRequested: sized.contractsNeeded, contractsFilled: filled, premiumUsd: filled * price, downPrice: price, txHash, expiry: new Date(quote.expiry * 1000), status: "OPEN" } });
      console.log(JSON.stringify({ event: "policy_hedge_created", policyId: policy.id, asset: policy.asset, marketId: quote.marketId, simulated: isDemo || !process.env.PRIVATE_KEY }));
    }
  } finally { await ctx.exchange.close().catch(() => undefined); }
}

async function tick(): Promise<void> { await settleOpenHedges(); await executePolicies(); }
async function main(): Promise<void> { console.log("Watchman settlement/policy agent started on Somnia Shannon testnet (50312)"); while (true) { try { await tick(); } catch (error) { console.error(error); } await sleep(intervalMs); } }
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
