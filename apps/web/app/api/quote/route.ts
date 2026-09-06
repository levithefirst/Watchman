import { NextResponse } from "next/server";
import { cheapestDownQuote, createWatchmanContext, getTUSDCBalance, quoteHedge, TUSDC, type HedgeRequest } from "@watchman/sdk";
import { logApiError, safeMessage } from "../_errors";

/**
 * A balance is either verified or unavailable, never silently zero.
 *
 * Reporting a failed lookup as 0 told a tester they held nothing while they
 * held 50 tUSDC. `token` is echoed so a balance read against the wrong
 * contract is diagnosable from the response instead of looking like an empty
 * wallet.
 */
type TokenBalance =
  | { status: "ok"; value: number; token: string }
  | { status: "unavailable"; token: string };

interface QuoteBody { asset: "BTC" | "ETH"; exposureUsd: number; protectionPct: number; windowSeconds: 900 | 3600; maxPremiumUsd: number; wallet?: `0x${string}` }
/**
 * Quoting walks the venue serially: one indexer read, then an on-chain status
 * read per candidate market, then an order book per surviving market. That is
 * well inside Vercel's 10s default on a healthy venue and over it on a slow
 * one, and a timeout surfaces as the generic "market data unavailable" state.
 * The headroom below buys a slow venue time without letting a dead one hang
 * the page indefinitely.
 */
export const maxDuration = 30;

const isBody = (value: unknown): value is QuoteBody => { if (!value || typeof value !== "object") return false; const body = value as Record<string, unknown>; return (body.asset === "BTC" || body.asset === "ETH") && typeof body.exposureUsd === "number" && typeof body.protectionPct === "number" && (body.windowSeconds === 900 || body.windowSeconds === 3600) && typeof body.maxPremiumUsd === "number"; };

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await request.json();
    if (!isBody(raw)) return NextResponse.json({ error: "Invalid quote request" }, { status: 400 });
    const ctx = createWatchmanContext(false);
    try {
      const liveExecutionAvailable = Boolean(process.env.PRIVATE_KEY);
      // The built-in faucet helper only exists outside production and only
      // works when the server holds a key. The UI uses this to decide whether
      // to offer it at all instead of letting the user hit a 403.
      const faucetAvailable = process.env.NODE_ENV !== "production" && liveExecutionAvailable;

      // balanceOf needs no market discovery, so it is resolved independently.
      // Previously it shared a try with the quote, so a venue outage left the
      // balance permanently on "checking…" even though the wallet was fine.
      const balancePromise: Promise<TokenBalance | undefined> = raw.wallet
        ? getTUSDCBalance(ctx, raw.wallet)
            .then((value): TokenBalance => ({ status: "ok", value, token: TUSDC }))
            .catch((error: unknown): TokenBalance => {
              logApiError("balance_failed", error, { token: TUSDC });
              return { status: "unavailable", token: TUSDC };
            })
        : Promise.resolve(undefined);

      const [quoteResult, balance] = await Promise.all([
        cheapestDownQuote(ctx, raw.asset, raw.windowSeconds).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
        balancePromise,
      ]);

      if (!quoteResult.ok) {
        // Watchman could not reach the venue. That is reported as its own kind
        // so the page never presents it as "the market is empty", and the
        // balance is still returned because it was resolved independently.
        logApiError("quote_failed", quoteResult.error);
        return NextResponse.json(
          { reason: "unavailable", balance, liveExecutionAvailable, faucetAvailable, error: safeMessage(quoteResult.error, "Unable to quote protection") },
          { status: 502 },
        );
      }

      const quote = quoteResult.value;
      // `reason: "no-liquidity"` means the venue answered and had nothing
      // usable. That is a real market condition, not a failure, and must never
      // be conflated with the transport being down.
      if (!quote) return NextResponse.json({ quote: null, balance, liveExecutionAvailable, faucetAvailable, reason: "no-liquidity", error: "No live Trading market with usable Down liquidity was found." });
      const requestData: HedgeRequest = { exposureUsd: raw.exposureUsd, protectionPct: raw.protectionPct, maxPremiumUsd: raw.maxPremiumUsd, windowSeconds: raw.windowSeconds };
      const hedge = quoteHedge(requestData, { downPrice: quote.downAsk, contractsAvailable: quote.contractsAvailable });
      return NextResponse.json({ quote: { ...quote, hedge }, balance, liveExecutionAvailable, faucetAvailable });
    } finally { await ctx.exchange.close().catch(() => undefined); }
  } catch (error) {
    logApiError("quote_failed", error);
    const message = safeMessage(error, "Unable to quote protection");
    return NextResponse.json({ reason: "unavailable", error: message }, { status: 502 });
  }
}
