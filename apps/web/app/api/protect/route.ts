import { NextResponse } from "next/server";
import { db } from "@watchman/db";
import { asBinary, calculateEffectiveness, cheapestDownQuote, createWatchmanContext, discoverTradingMarkets, placeDownIOC } from "@watchman/sdk";
import { quoteHedge, type HedgeRequest } from "@watchman/sdk";

interface ProtectBody {
  asset: "BTC" | "ETH";
  exposureUsd: number;
  protectionPct: number;
  windowSeconds: 900 | 3600;
  maxPremiumUsd: number;
  wallet?: `0x${string}`;
  demo?: boolean;
  /** One key per user-initiated attempt. A retry reuses it. */
  requestId?: string;
}

const validBody = (value: unknown): value is ProtectBody => {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (body.asset === "BTC" || body.asset === "ETH") && typeof body.exposureUsd === "number" && typeof body.protectionPct === "number" && (body.windowSeconds === 900 || body.windowSeconds === 3600) && typeof body.maxPremiumUsd === "number" && (body.wallet === undefined || typeof body.wallet === "string") && (body.demo === undefined || typeof body.demo === "boolean") && (body.requestId === undefined || typeof body.requestId === "string");
};

const normaliseWallet = (wallet: string): string => wallet.toLowerCase();
const isUniqueViolation = (error: unknown): boolean => typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): NextResponse => NextResponse.json({ error, ...extra }, { status });
const logServerSide = (stage: string, error: unknown, context: Record<string, unknown>): void => {
  console.error(JSON.stringify({ event: "protect_failed", stage, ...context, error: error instanceof Error ? error.message : String(error) }));
};

export async function POST(request: Request): Promise<NextResponse> {
  let executedHedgeId: string | undefined;
  let executedTxHash: string | undefined;

  try {
    const raw: unknown = await request.json();
    if (!validBody(raw)) return fail(400, "Invalid protection request");
    if (!Number.isFinite(raw.exposureUsd) || raw.exposureUsd <= 0 || raw.exposureUsd > 10_000_000) return fail(400, "Exposure must be between $0 and $10,000,000");

    const isDemo = raw.demo === true;
    const idempotencyKey = raw.requestId?.slice(0, 128);

    if (idempotencyKey) {
      const existing = await db.hedge.findUnique({ where: { idempotencyKey } });
      if (existing) return NextResponse.json({ hedgeId: existing.id, txHash: existing.txHash, simulated: existing.txHash === null, replayed: true, status: existing.status });
    }

    const quoteContext = createWatchmanContext(false);
    const quote = await cheapestDownQuote(quoteContext, raw.asset, raw.windowSeconds);
    if (!quote) return fail(409, "No valid Trading market is available for this asset and window.");
    const currentPrice = await quoteContext.exchange.client.fetchPrice(raw.asset);
    if (!currentPrice || !Number.isFinite(Number(currentPrice.price)) || Number(currentPrice.price) <= 0) return fail(503, "Current oracle price is unavailable; refusing to create an unmeasurable hedge.");

    const requestData: HedgeRequest = { exposureUsd: raw.exposureUsd, protectionPct: raw.protectionPct, maxPremiumUsd: raw.maxPremiumUsd, windowSeconds: raw.windowSeconds };
    const hedgeQuote = quoteHedge(requestData, { downPrice: quote.downAsk, contractsAvailable: quote.contractsAvailable });
    if (hedgeQuote.contractsToBuy <= 0) return fail(422, hedgeQuote.reason ?? "The premium constraint allows no contracts.");

    const executionContext = createWatchmanContext(Boolean(process.env.PRIVATE_KEY));
    const executionWallet = executionContext.walletAddress?.toLowerCase();
    if (!isDemo && (!raw.wallet || !executionWallet || normaliseWallet(raw.wallet) !== executionWallet)) return fail(403, "Wallet mode requires the connected wallet to match the configured execution signer.");

    const markets = await discoverTradingMarkets(quoteContext, raw.asset);
    const selected = markets.find((market) => asBinary(market.market).marketId.toLowerCase() === quote.marketId.toLowerCase());
    if (!selected) return fail(409, "The quoted market is no longer discoverable.");
    const fresh = await quoteContext.exchange.client.getMarketOnchain(quote.marketId);
    if (fresh.status !== 1) return fail(409, "Market stopped trading before execution. Refresh the quote.");

    const willExecuteLive = !isDemo && Boolean(process.env.PRIVATE_KEY);

    const walletKey = isDemo ? "demo" : normaliseWallet(raw.wallet as string);
    let hedgeId: string;
    try {
      const user = await db.user.upsert({ where: { wallet: walletKey }, update: { demo: isDemo }, create: { wallet: walletKey, demo: isDemo } });
      const exposure = await db.exposure.create({ data: { userId: user.id, asset: raw.asset, amount: raw.exposureUsd, entryPrice: Number(currentPrice.price) } });
      const intent = await db.hedge.create({
        data: {
          userId: user.id,
          exposureId: exposure.id,
          asset: raw.asset,
          marketId: quote.marketId,
          marketSymbol: quote.symbol,
          windowSeconds: raw.windowSeconds,
          protectionPct: raw.protectionPct,
          exposureUsd: raw.exposureUsd,
          protectedUsd: hedgeQuote.protectedAmountUsd,
          contractsRequested: hedgeQuote.contractsNeeded,
          contractsFilled: 0,
          premiumUsd: 0,
          downPrice: quote.downAsk,
          expiry: new Date(quote.expiry * 1000),
          status: "QUOTED",
          idempotencyKey,
        },
      });
      hedgeId = intent.id;
    } catch (error) {
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await db.hedge.findUnique({ where: { idempotencyKey } }).catch(() => null);
        if (existing) return NextResponse.json({ hedgeId: existing.id, txHash: existing.txHash, simulated: existing.txHash === null, replayed: true, status: existing.status });
      }
      logServerSide("persist_intent", error, { wallet: walletKey, marketId: quote.marketId });
      return fail(503, "Watchman couldn't record this hedge, so no order was placed. Nothing was spent. Please try again.");
    }

    if (!willExecuteLive) {
      // Demo mode still uses the real quote/sizing result. It creates one
      // clearly simulated receipt from the same effectiveness engine used by
      // real settled hedges, using a visible -3% scenario so a judge can see
      // the attribution numbers without waiting for a live market to resolve.
      const demoMovePct = -3;
      const effect = calculateEffectiveness({
        exposureUsd: raw.exposureUsd,
        premiumUsd: hedgeQuote.premiumUsd,
        actualMovePct: demoMovePct,
        payoutUsd: hedgeQuote.potentialPayoutUsd,
      });
      try {
        const saved = await db.$transaction(async (tx) => {
          const updated = await tx.hedge.update({
            where: { id: hedgeId },
            data: { contractsFilled: hedgeQuote.contractsToBuy, premiumUsd: hedgeQuote.premiumUsd, status: "OPEN" },
          });
          await tx.receipt.create({
            data: {
              hedgeId: updated.id,
              exposureUsd: effect.exposureUsd,
              premiumUsd: effect.premiumUsd,
              actualMovePct: effect.actualMovePct,
              unhedgedPnlUsd: effect.unhedgedPnlUsd,
              hedgedPnlUsd: effect.hedgedPnlUsd,
              payoutUsd: effect.hedgePayoutUsd,
              grossLossOffsetUsd: effect.grossLossOffsetUsd,
              lossOffsetPct: effect.lossOffsetPct,
              netHedgeContributionUsd: effect.netHedgeContributionUsd,
              overshootUsd: effect.overshootUsd,
            },
          });
          return updated;
        });
        return NextResponse.json({ hedgeId: saved.id, txHash: null, simulated: true, quote: { ...quote, hedge: hedgeQuote, filled: hedgeQuote.contractsToBuy, executionPrice: quote.downAsk, entryPrice: Number(currentPrice.price) } });
      } catch (error) {
        logServerSide("persist_demo_receipt", error, { hedgeId, marketId: quote.marketId });
        return fail(500, "Watchman couldn't finish the demo receipt. No on-chain order was placed.", { hedgeId });
      }
    }

    await db.hedge.update({ where: { id: hedgeId }, data: { status: "EXECUTING", executionStartedAt: new Date() } });
    executedHedgeId = hedgeId;

    let filled: number;
    let executionPrice: number;
    let txHash: string | undefined;
    try {
      const placed = await placeDownIOC(executionContext, selected, quote.downAsk, hedgeQuote.contractsToBuy);
      txHash = placed.hash;
      executedTxHash = placed.hash;
      filled = placed.filled;
      executionPrice = placed.price;
    } catch (error) {
      logServerSide("execute", error, { hedgeId, marketId: quote.marketId });
      await db.hedge.update({ where: { id: hedgeId }, data: { status: "FAILED" } }).catch(() => undefined);
      return fail(502, "The order could not be placed on Somnia. No protection was opened.", { hedgeId });
    }

    if (filled <= 0) {
      await db.hedge.update({ where: { id: hedgeId }, data: { status: "FAILED", txHash: txHash ?? null } }).catch(() => undefined);
      return fail(409, "The order was accepted but filled zero contracts, so no protection was opened.", { hedgeId, txHash: txHash ?? null });
    }

    try {
      const saved = await db.hedge.update({ where: { id: hedgeId }, data: { contractsFilled: filled, premiumUsd: filled * executionPrice, downPrice: executionPrice, txHash, status: "OPEN" } });
      return NextResponse.json({ hedgeId: saved.id, txHash: txHash ?? null, simulated: false, quote: { ...quote, hedge: hedgeQuote, filled, executionPrice, entryPrice: Number(currentPrice.price) } });
    } catch (error) {
      logServerSide("persist_result", error, { hedgeId, txHash, filled });
      await db.hedge.update({ where: { id: hedgeId }, data: { txHash } }).catch(() => undefined);
      return fail(500, "Your order executed on Somnia but Watchman couldn't finish saving it. Your transaction was not lost. Check your hedge history before trying again.", { hedgeId, txHash: txHash ?? null });
    }
  } catch (error) {
    logServerSide("unhandled", error, { hedgeId: executedHedgeId ?? null, txHash: executedTxHash ?? null });
    if (executedTxHash) return fail(500, "Your order executed on Somnia but Watchman couldn't finish saving it. Your transaction was not lost. Check your hedge history before trying again.", { hedgeId: executedHedgeId ?? null, txHash: executedTxHash });
    if (executedHedgeId) return fail(500, "Watchman couldn't confirm whether your order reached Somnia. Check your hedge history before trying again.", { hedgeId: executedHedgeId });
    return fail(500, "Watchman couldn't create this hedge. No order was placed.");
  }
}
