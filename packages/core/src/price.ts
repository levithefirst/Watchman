import { usdToCents } from "./money.js";

export interface SourceQuote {
  source: string;
  priceCents: number;
}

/** One reading of ETH/USD, built from every source that answered. */
export interface PriceObservation {
  /** The price Watchman acts on: the highest valid quote, so one low print can never trigger a sale. */
  priceCents: number;
  observedAt: Date;
  quotes: SourceQuote[];
  /** Gap between the highest and lowest quote, in bps of the highest. */
  spreadBps: number;
  simulated: boolean;
}

/** Anything above this between sources means the feed is not trustworthy right now. */
export const MAX_SOURCE_SPREAD_BPS = 150;
/** Sanity bounds. A reading outside these is a broken feed, not a market move. */
export const MIN_SANE_CENTS = 10_00;
export const MAX_SANE_CENTS = 1_000_000_00;

export function combineQuotes(quotes: SourceQuote[], observedAt: Date, simulated = false): PriceObservation | null {
  const valid = quotes.filter((q) => Number.isSafeInteger(q.priceCents) && q.priceCents >= MIN_SANE_CENTS && q.priceCents <= MAX_SANE_CENTS);
  if (valid.length === 0) return null;
  const high = Math.max(...valid.map((q) => q.priceCents));
  const low = Math.min(...valid.map((q) => q.priceCents));
  return { priceCents: high, observedAt, quotes: valid, spreadBps: Math.floor(((high - low) * 10_000) / high), simulated };
}

export interface PriceFeed {
  latest(): Promise<PriceObservation | null>;
}

type Fetch = typeof fetch;

async function getJson(fetchImpl: Fetch, url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.json();
}

async function coinbase(fetchImpl: Fetch, timeoutMs: number): Promise<SourceQuote | null> {
  const body = (await getJson(fetchImpl, "https://api.coinbase.com/v2/prices/ETH-USD/spot", timeoutMs)) as { data?: { amount?: string } };
  const cents = body.data?.amount ? usdToCents(body.data.amount) : null;
  return cents ? { source: "Coinbase", priceCents: cents } : null;
}

async function kraken(fetchImpl: Fetch, timeoutMs: number): Promise<SourceQuote | null> {
  const body = (await getJson(fetchImpl, "https://api.kraken.com/0/public/Ticker?pair=ETHUSD", timeoutMs)) as {
    error?: string[];
    result?: Record<string, { c?: [string, string] }>;
  };
  if (body.error?.length) return null;
  const last = body.result ? Object.values(body.result)[0]?.c?.[0] : undefined;
  const cents = last ? usdToCents(last) : null;
  return cents ? { source: "Kraken", priceCents: cents } : null;
}

/**
 * Live ETH/USD from two independent public venues, read in parallel. Either
 * may fail; the observation carries whichever answered.
 */
export class PublicPriceFeed implements PriceFeed {
  constructor(private readonly opts: { fetchImpl?: Fetch; timeoutMs?: number; now?: () => Date } = {}) {}

  async latest(): Promise<PriceObservation | null> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const timeoutMs = this.opts.timeoutMs ?? 4_000;
    const settled = await Promise.allSettled([coinbase(fetchImpl, timeoutMs), kraken(fetchImpl, timeoutMs)]);
    const quotes = settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    return combineQuotes(quotes, (this.opts.now ?? (() => new Date()))());
  }
}

/**
 * The demo market. A pure function of the protection's reference price and
 * clock, so every viewer and every retry sees the same price at the same
 * moment. It drifts gently around the reference until a drop is requested,
 * then falls 13% over ten seconds, crossing a 10% trigger on the way down.
 */
export function demoPriceCents(input: { referenceCents: number; armedAt: Date; dropAt: Date | null; now: Date }): number {
  const t = (input.now.getTime() - input.armedAt.getTime()) / 1000;
  const wobble = 0.0035 * Math.sin((2 * Math.PI * t) / 23) + 0.0015 * Math.sin((2 * Math.PI * t) / 7.3) - 0.003 * Math.min(1, t / 40);
  let fall = 0;
  if (input.dropAt) {
    const s = Math.max(0, Math.min(1, (input.now.getTime() - input.dropAt.getTime()) / 10_000));
    fall = 0.13 * (s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2);
  }
  return Math.round(input.referenceCents * (1 + wobble) * (1 - fall));
}

export function demoObservation(input: Parameters<typeof demoPriceCents>[0]): PriceObservation {
  return combineQuotes([{ source: "Simulated market", priceCents: demoPriceCents(input) }], input.now, true)!;
}
