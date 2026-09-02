import { SomniaMarkets, ORDER_TYPE, type MarketOnchain, type UnifiedMarket, type BinarySide } from "@somnia-chain/markets-sdk";
import { defineChain, type Hex } from "viem";
import { COLLATERAL_DECIMALS, MARKET_STATUS, TUSDC, WATCHMAN_ADDRESSES, WATCHMAN_CHAIN_ID, WATCHMAN_INDEXER_URL, WATCHMAN_RPC_URL, envConfig } from "./config.js";

const chain = defineChain({ id: WATCHMAN_CHAIN_ID, name: "Somnia Shannon", nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 }, rpcUrls: { default: { http: [WATCHMAN_RPC_URL] } } });

export interface WatchmanContext { exchange: SomniaMarkets; walletAddress?: `0x${string}`; }
export interface TradingMarket { market: UnifiedMarket; onchain: MarketOnchain; yesSymbol: string; noSymbol: string; }
export interface DownQuote { marketId: Hex; symbol: string; asset: string; windowSeconds: number; expiry: number; upBid: number; downAsk: number; contractsAvailable: number; }
export interface PlacedHedge { hash?: string; filled: number; price: number; marketId: Hex; expiry: number; }

export function createWatchmanContext(withSigner = false): WatchmanContext {
  const cfg = envConfig();
  if (withSigner && !cfg.privateKey) throw new Error("PRIVATE_KEY is required for Somnia Shannon writes");
  const exchange = new SomniaMarkets({ indexerUrl: WATCHMAN_INDEXER_URL, chain, addresses: WATCHMAN_ADDRESSES, privateKey: withSigner ? cfg.privateKey : undefined });
  return { exchange, walletAddress: exchange.walletAddress as `0x${string}` | undefined };
}

export async function discoverTradingMarkets(ctx: WatchmanContext, asset?: "BTC" | "ETH"): Promise<TradingMarket[]> {
  const rows = Object.values(await ctx.exchange.loadMarkets(true));
  const candidates = rows.filter((m) => m.type === "binary" && m.active && m.info.marketType === "BINARY" && (!asset || m.info.asset === asset));
  const out: TradingMarket[] = [];
  for (const market of candidates) {
    const onchain = await ctx.exchange.client.getMarketOnchain(market.info.marketId as Hex);
    if (onchain.status !== MARKET_STATUS.Trading) continue;
    const yesSymbol = market.outcomes?.[0]?.symbol ?? `${market.symbol}#YES`;
    const noSymbol = market.outcomes?.[1]?.symbol ?? `${market.symbol}#NO`;
    out.push({ market, onchain, yesSymbol, noSymbol });
  }
  return out;
}

export async function quoteDown(ctx: WatchmanContext, trading: TradingMarket): Promise<DownQuote | null> {
  const fresh = await ctx.exchange.client.getMarketOnchain(trading.market.info.marketId as Hex);
  if (fresh.status !== MARKET_STATUS.Trading) return null;
  const book = await ctx.exchange.fetchOrderBook(trading.yesSymbol, 5);
  const upBid = book.bids[0]?.[0];
  if (upBid === undefined || upBid <= 0 || upBid >= 1) return null;
  const downAsk = 1 - upBid;
  const available = book.bids[0]?.[1] ?? 0;
  return { marketId: trading.market.info.marketId as Hex, symbol: trading.market.symbol, asset: trading.market.info.asset ?? "", windowSeconds: trading.market.info.intervalSec ?? 0, expiry: Number(fresh.expiry), upBid, downAsk, contractsAvailable: available };
}

export async function cheapestDownQuote(ctx: WatchmanContext, asset: "BTC" | "ETH", windowSeconds: number): Promise<DownQuote | null> {
  const markets = await discoverTradingMarkets(ctx, asset);
  const quotes: DownQuote[] = [];
  for (const market of markets) {
    const q = await quoteDown(ctx, market);
    if (q && q.windowSeconds === windowSeconds && q.expiry > Math.floor(Date.now() / 1000)) quotes.push(q);
  }
  quotes.sort((a, b) => a.downAsk - b.downAsk);
  return quotes[0] ?? null;
}

export async function getTUSDCBalance(ctx: WatchmanContext, address?: `0x${string}`): Promise<number> {
  const account = address ?? ctx.walletAddress;
  if (!account) return 0;
  const raw = await ctx.exchange.client.getErc20Balance(TUSDC, account);
  return Number(raw) / 10 ** COLLATERAL_DECIMALS;
}

export async function placeDownIOC(ctx: WatchmanContext, trading: TradingMarket, price: number, contracts: number): Promise<PlacedHedge> {
  if (!ctx.exchange.walletAddress) throw new Error("No signer wallet configured");
  const fresh = await ctx.exchange.client.getMarketOnchain(trading.market.info.marketId as Hex);
  if (fresh.status !== MARKET_STATUS.Trading) throw new Error("Market is no longer Trading. Quote invalidated; refusing write.");
  const one = 10n ** BigInt(COLLATERAL_DECIMALS);
  const priceRaw = BigInt(Math.round(price * Number(one)));
  const qtyRaw = BigInt(Math.floor(contracts * Number(one)));
  if (priceRaw <= 0n || priceRaw >= one || qtyRaw <= 0n) throw new Error("Invalid IOC price or contract size");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.min(now + 300, Number(fresh.expiry));
  if (expiresAt <= now) throw new Error("Market expires before an IOC can be sent");
  const res = await ctx.exchange.trader.placeOrder({ pool: fresh.pool, side: "BUY_NO" as BinarySide, price: one - priceRaw, quantity: qtyRaw, outcomeToken: fresh.outcomeToken, yesId: fresh.yesId, noId: fresh.noId, orderType: ORDER_TYPE.MARKET, expireTimestampNs: BigInt(expiresAt) * 1_000_000_000n });
  if (res.receipt?.status === "reverted") throw new Error(`IOC reverted on-chain: ${res.hash ?? "unknown tx"}`);
  const filledRaw = (res.fills ?? []).reduce((sum, fill) => sum + fill.quantityFilled, 0n);
  return { hash: res.hash, filled: Number(filledRaw) / Number(one), price: Number(priceRaw) / Number(one), marketId: trading.market.info.marketId as Hex, expiry: Number(fresh.expiry) };
}

export async function faucetTUSDC(ctx: WatchmanContext): Promise<string | undefined> {
  if (!ctx.exchange.walletAddress) throw new Error("Connect a wallet or configure PRIVATE_KEY first");
  const res = await ctx.exchange.trader.faucet();
  if (res.receipt?.status === "reverted") throw new Error(`tUSDC faucet reverted: ${res.hash ?? "unknown tx"}`);
  return res.hash;
}

export async function redeem(ctx: WatchmanContext, marketId: Hex, outcome: 0 | 1, amount: bigint): Promise<string | undefined> {
  const onchain = await ctx.exchange.client.getMarketOnchain(marketId);
  if (!onchain.isResolved && !onchain.isVoided) throw new Error("Market is not settled; redemption is blocked");
  const res = await ctx.exchange.trader.redeem({ marketId, market: onchain.marketAddress, outcomeToken: onchain.outcomeToken, outcomeIdx: outcome, amount });
  if (res.receipt?.status === "reverted") throw new Error(`Redeem reverted: ${res.hash ?? "unknown tx"}`);
  return res.hash;
}

export { TUSDC };
