import { NextResponse } from "next/server";
import { db } from "@watchman/db";
import { cheapestDownQuote, createWatchmanContext, discoverTradingMarkets, placeDownIOC } from "@watchman/sdk";
import { quoteHedge, type HedgeRequest } from "@watchman/sdk";

interface ProtectBody {
  asset: "BTC" | "ETH";
  exposureUsd: number;
  protectionPct: number;
  windowSeconds: 900 | 3600;
  maxPremiumUsd: number;
  wallet?: `0x${string}`;
  demo?: boolean;
}

const validBody = (value: unknown): value is ProtectBody => {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (body.asset === "BTC" || body.asset === "ETH") && typeof body.exposureUsd === "number" && typeof body.protectionPct === "number" && (body.windowSeconds === 900 || body.windowSeconds === 3600) && typeof body.maxPremiumUsd === "number" && (body.wallet === undefined || typeof body.wallet === "string") && (body.demo === undefined || typeof body.demo === "boolean");
};

const normaliseWallet = (wallet: string): string => wallet.toLowerCase();

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await request.json();
    if (!validBody(raw)) return NextResponse.json({ error: "Invalid protection request" }, { status: 400 });
    if (!Number.isFinite(raw.exposureUsd) || raw.exposureUsd <= 0 || raw.exposureUsd > 10_000_000) return NextResponse.json({ error: "Exposure must be between $0 and $10,000,000" }, { status: 400 });

    const quoteContext = createWatchmanContext(false);
    const quote = await cheapestDownQuote(quoteContext, raw.asset, raw.windowSeconds);
    if (!quote) return NextResponse.json({ error: "No valid Trading market is available for this asset and window." }, { status: 409 });
    const currentPrice = await quoteContext.exchange.client.fetchPrice(raw.asset);
    if (!currentPrice || !Number.isFinite(Number(currentPrice.price)) || Number(currentPrice.price) <= 0) return NextResponse.json({ error: "Current oracle price is unavailable; refusing to create an unmeasurable hedge." }, { status: 503 });

    const requestData: HedgeRequest = { exposureUsd: raw.exposureUsd, protectionPct: raw.protectionPct, maxPremiumUsd: raw.maxPremiumUsd, windowSeconds: raw.windowSeconds };
    const hedgeQuote = quoteHedge(requestData, { downPrice: quote.downAsk, contractsAvailable: quote.contractsAvailable });
    if (hedgeQuote.contractsToBuy <= 0) return NextResponse.json({ error: hedgeQuote.reason ?? "The premium constraint allows no contracts." }, { status: 422 });

    const isDemo = raw.demo === true;
    const executionContext = createWatchmanContext(Boolean(process.env.PRIVATE_KEY));
    const executionWallet = executionContext.walletAddress?.toLowerCase();
    if (!isDemo && (!raw.wallet || !executionWallet || normaliseWallet(raw.wallet) !== executionWallet)) return NextResponse.json({ error: "Wallet mode requires the connected wallet to match the configured execution signer." }, { status: 403 });

    const markets = await discoverTradingMarkets(quoteContext, raw.asset);
    const selected = markets.find((market) => market.market.info.marketId.toLowerCase() === quote.marketId.toLowerCase());
    if (!selected) return NextResponse.json({ error: "The quoted market is no longer discoverable." }, { status: 409 });
    const fresh = await quoteContext.exchange.client.getMarketOnchain(quote.marketId);
    if (fresh.status !== 1) return NextResponse.json({ error: "Market stopped trading before execution. Refresh the quote." }, { status: 409 });

    let txHash: string | undefined;
    let filled = hedgeQuote.contractsToBuy;
    let executionPrice = quote.downAsk;
    if (process.env.PRIVATE_KEY) {
      const placed = await placeDownIOC(executionContext, selected, quote.downAsk, hedgeQuote.contractsToBuy);
      txHash = placed.hash;
      filled = placed.filled;
      executionPrice = placed.price;
      if (filled <= 0) return NextResponse.json({ error: "IOC order was accepted but filled zero contracts." }, { status: 409 });
    }

    const walletKey = isDemo ? "demo" : normaliseWallet(raw.wallet as string);
    const user = await db.user.upsert({ where: { wallet: walletKey }, update: { demo: isDemo }, create: { wallet: walletKey, demo: isDemo } });
    const exposure = await db.exposure.create({ data: { userId: user.id, asset: raw.asset, amount: raw.exposureUsd, entryPrice: Number(currentPrice.price) } });
    const saved = await db.hedge.create({ data: { userId: user.id, exposureId: exposure.id, asset: raw.asset, marketId: quote.marketId, marketSymbol: quote.symbol, windowSeconds: raw.windowSeconds, protectionPct: raw.protectionPct, exposureUsd: raw.exposureUsd, protectedUsd: hedgeQuote.protectedAmountUsd, contractsRequested: hedgeQuote.contractsNeeded, contractsFilled: filled, premiumUsd: filled * executionPrice, downPrice: executionPrice, txHash, expiry: new Date(quote.expiry * 1000), status: "OPEN" } });

    return NextResponse.json({ hedgeId: saved.id, txHash: txHash ?? null, simulated: !process.env.PRIVATE_KEY, quote: { ...quote, hedge: hedgeQuote, filled, executionPrice, entryPrice: Number(currentPrice.price) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to protect position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
