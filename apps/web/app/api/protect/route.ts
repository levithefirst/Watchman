import { NextResponse } from "next/server";
import { db } from "@watchman/db";
import { asBinary, cheapestDownQuote, createWatchmanContext, discoverTradingMarkets, placeDownIOC } from "@watchman/sdk";
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

/** Postgres unique-violation, i.e. this requestId already executed. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

/**
 * What the browser is allowed to see.
 *
 * A raw exception here leaked Prisma internals and filesystem paths straight
 * into the UI. Every failure is now mapped to a fixed, safe message; the real
 * error is logged server-side for operators.
 */
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): NextResponse =>
  NextResponse.json({ error, ...extra }, { status });

const logServerSide = (stage: string, error: unknown, context: Record<string, unknown>): void => {
  console.error(JSON.stringify({
    event: "protect_failed",
    stage,
    ...context,
    error: error instanceof Error ? error.message : String(error),
  }));
};

export async function POST(request: Request): Promise<NextResponse> {
  // Set as soon as an order is sent, so the catch-all can tell the user
  // whether their money is at stake.
  let executedHedgeId: string | undefined;
  let executedTxHash: string | undefined;

  try {
    const raw: unknown = await request.json();
    if (!validBody(raw)) return fail(400, "Invalid protection request");
    if (!Number.isFinite(raw.exposureUsd) || raw.exposureUsd <= 0 || raw.exposureUsd > 10_000_000) return fail(400, "Exposure must be between $0 and $10,000,000");

    const isDemo = raw.demo === true;
    const idempotencyKey = raw.requestId?.slice(0, 128);

    // ---------------------------------------------------------------- retry
    // Before doing anything, check whether this exact attempt already ran.
    // Case E: the user retries because the first response was lost. The order
    // already executed; re-executing would spend real funds twice.
    if (idempotencyKey) {
      const existing = await db.hedge.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return NextResponse.json({
          hedgeId: existing.id,
          txHash: existing.txHash,
          simulated: existing.txHash === null,
          replayed: true,
          status: existing.status,
        });
      }
    }

    // ------------------------------------------------------------ pre-trade
    // All read-only. Nothing here can move funds.
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

    // ------------------------------------------------- persist intent FIRST
    // Case A: if the database is unreachable we find out here, BEFORE any
    // order is sent, and nothing is spent. This ordering is the whole point:
    // the previous version executed first and discovered Prisma was broken
    // only afterwards, losing the record of real spent funds.
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
          // Nothing is filled or paid until the order comes back.
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
      // A concurrent retry won the race; return its hedge rather than executing.
      if (idempotencyKey && isUniqueViolation(error)) {
        const existing = await db.hedge.findUnique({ where: { idempotencyKey } }).catch(() => null);
        if (existing) return NextResponse.json({ hedgeId: existing.id, txHash: existing.txHash, simulated: existing.txHash === null, replayed: true, status: existing.status });
      }
      logServerSide("persist_intent", error, { wallet: walletKey, marketId: quote.marketId });
      // Nothing was executed, so this is safe to retry outright.
      return fail(503, "Watchman couldn't record this hedge, so no order was placed. Nothing was spent. Please try again.");
    }

    // ----------------------------------------------------------- simulation
    if (!willExecuteLive) {
      const saved = await db.hedge.update({
        where: { id: hedgeId },
        data: { contractsFilled: hedgeQuote.contractsToBuy, premiumUsd: hedgeQuote.premiumUsd, status: "OPEN" },
      });
      return NextResponse.json({ hedgeId: saved.id, txHash: null, simulated: true, quote: { ...quote, hedge: hedgeQuote, filled: hedgeQuote.contractsToBuy, executionPrice: quote.downAsk, entryPrice: Number(currentPrice.price) } });
    }

    // ------------------------------------------------------------- execute
    // Mark the danger window before sending. If the process dies between here
    // and the update below, the row says EXECUTING and carries the wallet,
    // market and size needed to reconcile against the chain.
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
      // Case B: the order itself failed. It may still have burned gas, so the
      // row is kept (FAILED) rather than deleted, with whatever we know.
      logServerSide("execute", error, { hedgeId, marketId: quote.marketId });
      await db.hedge.update({ where: { id: hedgeId }, data: { status: "FAILED" } }).catch(() => undefined);
      return fail(502, "The order could not be placed on Somnia. No protection was opened.", { hedgeId });
    }

    // Case F: an IOC can come back with nothing filled. Record it and stop.
    if (filled <= 0) {
      await db.hedge.update({ where: { id: hedgeId }, data: { status: "FAILED", txHash: txHash ?? null } }).catch(() => undefined);
      return fail(409, "The order was accepted but filled zero contracts, so no protection was opened.", { hedgeId, txHash: txHash ?? null });
    }

    // --------------------------------------------------- confirm the result
    // Case C: if THIS write fails the funds are already spent, but the hedge
    // row exists in EXECUTING with the transaction hash we know, so nothing
    // is lost and the agent can reconcile it.
    try {
      const saved = await db.hedge.update({
        where: { id: hedgeId },
        // Actual fill, not the requested size (case F: partial fills).
        data: { contractsFilled: filled, premiumUsd: filled * executionPrice, downPrice: executionPrice, txHash, status: "OPEN" },
      });
      return NextResponse.json({ hedgeId: saved.id, txHash: txHash ?? null, simulated: false, quote: { ...quote, hedge: hedgeQuote, filled, executionPrice, entryPrice: Number(currentPrice.price) } });
    } catch (error) {
      logServerSide("persist_result", error, { hedgeId, txHash, filled });
      // Record the hash on a best-effort basis so recovery has the strongest
      // possible evidence, then tell the truth about what happened.
      await db.hedge.update({ where: { id: hedgeId }, data: { txHash } }).catch(() => undefined);
      return fail(500, "Your order executed on Somnia but Watchman couldn't finish saving it. Your transaction was not lost. Check your hedge history before trying again.", { hedgeId, txHash: txHash ?? null });
    }
  } catch (error) {
    logServerSide("unhandled", error, { hedgeId: executedHedgeId ?? null, txHash: executedTxHash ?? null });
    // Only claim the transaction survived when we actually hold its hash.
    if (executedTxHash) {
      return fail(500, "Your order executed on Somnia but Watchman couldn't finish saving it. Your transaction was not lost. Check your hedge history before trying again.", { hedgeId: executedHedgeId ?? null, txHash: executedTxHash });
    }
    if (executedHedgeId) {
      return fail(500, "Watchman couldn't confirm whether your order reached Somnia. Check your hedge history before trying again.", { hedgeId: executedHedgeId });
    }
    return fail(500, "Watchman couldn't create this hedge. No order was placed.");
  }
}
