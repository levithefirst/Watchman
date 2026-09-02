import { db } from "@watchman/db";
import { calculateEffectiveness } from "@watchman/sdk";
import { createWatchmanContext, redeem } from "@watchman/sdk";
import { COLLATERAL_DECIMALS } from "@watchman/sdk";
import type { MarketOnchain } from "@somnia-chain/markets-sdk";

const intervalMs = Number(process.env.SETTLEMENT_POLL_MS ?? 10_000);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface OracleAnswer { numericValue: string; decimals: number }
interface ResolutionData { closingAnswer?: OracleAnswer | null; openingAnswer?: OracleAnswer | null }

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Expected a finite numeric oracle value");
  return parsed;
};

const resolutionMovePct = (resolution: ResolutionData, entryPrice: number): number => {
  const close = resolution.closingAnswer;
  if (!close) return 0;
  const closePrice = toNumber(close.numericValue) / 10 ** close.decimals;
  if (entryPrice <= 0 || closePrice <= 0) return 0;
  return ((closePrice - entryPrice) / entryPrice) * 100;
};

const payoutFor = (amount: bigint, decimals: number, onchain: MarketOnchain, settlementFeeBps: bigint): number => {
  const units = Number(amount) / 10 ** decimals;
  if (onchain.isVoided) return units / 2;
  if (!onchain.isResolved) return 0;
  return units * Math.max(0, 1 - Number(settlementFeeBps) / 10_000);
};

async function settleOne(hedge: Awaited<ReturnType<typeof db.hedge.findMany>>[number]): Promise<void> {
  const ctx = createWatchmanContext(Boolean(process.env.PRIVATE_KEY));
  try {
    const onchain = await ctx.exchange.client.getMarketOnchain(hedge.marketId as `0x${string}`);
    const expired = Number(onchain.expiry) <= Math.floor(Date.now() / 1000);
    if (!expired && !onchain.isResolved && !onchain.isVoided) return;
    if (!onchain.isResolved && !onchain.isVoided) return;

    const resolution = await ctx.exchange.client.getMarketResolution(hedge.marketId);
    const entryPrice = Number(hedge.exposure?.entryPrice ?? 0);
    const actualMovePct = resolutionMovePct(resolution, entryPrice);
    const settlementFees = await ctx.exchange.client.getMarketFees(hedge.marketId);
    const feeBps = BigInt(settlementFees?.settlementFeeBps ?? 0);

    let payoutUsd = 0;
    if (process.env.PRIVATE_KEY && ctx.walletAddress) {
      const heldYes = await ctx.exchange.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account: ctx.walletAddress, id: onchain.yesId });
      const heldNo = await ctx.exchange.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account: ctx.walletAddress, id: onchain.noId });
      const claimable: Array<{ outcome: 0 | 1; amount: bigint }> = [];
      if (onchain.isVoided) {
        if (heldYes > 0n) claimable.push({ outcome: 0, amount: heldYes });
        if (heldNo > 0n) claimable.push({ outcome: 1, amount: heldNo });
      } else if (onchain.isResolved && onchain.winningOutcome === 1 && heldNo > 0n) {
        claimable.push({ outcome: 1, amount: heldNo });
      } else if (onchain.isResolved && onchain.winningOutcome === 0 && heldYes > 0n) {
        claimable.push({ outcome: 0, amount: heldYes });
      }
      for (const position of claimable) {
        payoutUsd += payoutFor(position.amount, onchain.decimals || COLLATERAL_DECIMALS, onchain, feeBps);
        await redeem(ctx, hedge.marketId as `0x${string}`, position.outcome, position.amount);
      }
      if (claimable.length === 0) payoutUsd = onchain.isResolved && onchain.winningOutcome === 1 ? Number(hedge.contractsFilled) * Math.max(0, 1 - Number(feeBps) / 10_000) : 0;
    } else {
      payoutUsd = onchain.isVoided ? Number(hedge.contractsFilled) / 2 : onchain.winningOutcome === 1 ? Number(hedge.contractsFilled) * Math.max(0, 1 - Number(feeBps) / 10_000) : 0;
    }

    const effectiveness = calculateEffectiveness({ exposureUsd: Number(hedge.exposureUsd), premiumUsd: Number(hedge.premiumUsd), actualMovePct, payoutUsd });
    await db.$transaction([
      db.receipt.upsert({ where: { hedgeId: hedge.id }, update: {}, create: { hedgeId: hedge.id, exposureUsd: effectiveness.exposureUsd, premiumUsd: effectiveness.premiumUsd, actualMovePct: effectiveness.actualMovePct, unhedgedPnlUsd: effectiveness.unhedgedPnlUsd, hedgedPnlUsd: effectiveness.hedgedPnlUsd, payoutUsd: effectiveness.hedgePayoutUsd, netProtectionUsd: effectiveness.netProtectionUsd, efficiencyPct: effectiveness.efficiencyPct } }),
      db.hedge.update({ where: { id: hedge.id }, data: { status: "REDEEMED", settledAt: new Date(), redeemedAt: process.env.PRIVATE_KEY ? new Date() : null } }),
    ]);
    console.log(JSON.stringify({ event: "hedge_settled", hedgeId: hedge.id, marketId: hedge.marketId, payoutUsd, actualMovePct, efficiencyPct: effectiveness.efficiencyPct }));
  } finally {
    await ctx.exchange.close().catch(() => undefined);
  }
}

async function tick(): Promise<void> {
  const candidates = await db.hedge.findMany({ where: { status: { in: ["OPEN", "SETTLING"] } }, include: { exposure: true }, orderBy: { expiry: "asc" }, take: 50 });
  for (const hedge of candidates) {
    const lock = await db.hedge.updateMany({ where: { id: hedge.id, status: { in: ["OPEN", "SETTLING"] } }, data: { status: "SETTLING" } });
    if (lock.count !== 1) continue;
    try {
      await settleOne(hedge);
    } catch (error) {
      await db.hedge.update({ where: { id: hedge.id }, data: { status: "OPEN" } }).catch(() => undefined);
      console.error(JSON.stringify({ event: "hedge_settlement_retry", hedgeId: hedge.id, error: error instanceof Error ? error.message : "unknown error" }));
    }
  }
}

async function main(): Promise<void> {
  console.log("Watchman settlement agent started on Somnia Shannon testnet (50312)");
  while (true) {
    try { await tick(); } catch (error) { console.error(error); }
    await sleep(intervalMs);
  }
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
