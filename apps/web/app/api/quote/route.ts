import { NextResponse } from "next/server";
import { cheapestDownQuote, createWatchmanContext, getTUSDCBalance, quoteHedge, type HedgeRequest } from "@watchman/sdk";

interface QuoteBody { asset: "BTC" | "ETH"; exposureUsd: number; protectionPct: number; windowSeconds: 900 | 3600; maxPremiumUsd: number; wallet?: `0x${string}` }
const isBody = (value: unknown): value is QuoteBody => { if (!value || typeof value !== "object") return false; const body = value as Record<string, unknown>; return (body.asset === "BTC" || body.asset === "ETH") && typeof body.exposureUsd === "number" && typeof body.protectionPct === "number" && (body.windowSeconds === 900 || body.windowSeconds === 3600) && typeof body.maxPremiumUsd === "number"; };
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await request.json();
    if (!isBody(raw)) return NextResponse.json({ error: "Invalid quote request" }, { status: 400 });
    const ctx = createWatchmanContext(false);
    try {
      const quote = await cheapestDownQuote(ctx, raw.asset, raw.windowSeconds);
      const balance = raw.wallet ? await getTUSDCBalance(ctx, raw.wallet) : undefined;
      const liveExecutionAvailable = Boolean(process.env.PRIVATE_KEY);
      if (!quote) return NextResponse.json({ quote: null, balance, liveExecutionAvailable, error: "No live Trading market with usable Down liquidity was found." });
      const requestData: HedgeRequest = { exposureUsd: raw.exposureUsd, protectionPct: raw.protectionPct, maxPremiumUsd: raw.maxPremiumUsd, windowSeconds: raw.windowSeconds };
      const hedge = quoteHedge(requestData, { downPrice: quote.downAsk, contractsAvailable: quote.contractsAvailable });
      return NextResponse.json({ quote: { ...quote, hedge }, balance, liveExecutionAvailable });
    } finally { await ctx.exchange.close().catch(() => undefined); }
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to quote protection"; return NextResponse.json({ error: message }, { status: 500 }); }
}
