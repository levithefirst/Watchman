import { SOMNIA_TESTNET_PRICE_FEED } from "@somnia-chain/markets-sdk";

export const WATCHMAN_CHAIN_ID = 50312 as const;
export const WATCHMAN_RPC_URL = "https://api.infra.testnet.somnia.network";
/**
 * Somnia Shannon's WebSocket RPC. The markets SDK has NO HTTP fallback: the
 * live tail, every on-chain read (market status, balances) and every write go
 * over this one socket. Without it the SDK throws
 * "this operation needs chain access", which surfaced as a bogus
 * "no liquidity" state because a transport failure and an empty order book
 * both ended up on the same code path.
 *
 * Server-side only (the SDK never runs in the browser: it is used from
 * apps/web route handlers and apps/agent), so this is deliberately not a
 * NEXT_PUBLIC_* variable. Overridable for operators who run their own node;
 * otherwise it stays a fixed testnet constant like WATCHMAN_RPC_URL.
 */
export const WATCHMAN_WS_RPC_URL =
  process.env.SOMNIA_WS_RPC_URL ?? "wss://api.infra.testnet.somnia.network/ws";

/**
 * Fails loudly rather than letting a missing or malformed socket URL reach the
 * SDK, where it would only show up later as an opaque chain-access error.
 */
export const resolveWsRpcUrl = (): string => {
  const url = WATCHMAN_WS_RPC_URL.trim();
  if (!url) throw new Error("Somnia WebSocket RPC is not configured. Set SOMNIA_WS_RPC_URL to a wss:// endpoint.");
  if (!url.startsWith("wss://") && !url.startsWith("ws://")) throw new Error(`Somnia WebSocket RPC must be a ws:// or wss:// URL, got "${url}".`);
  return url;
};
export const WATCHMAN_INDEXER_URL = "https://dev.smk.somnia.host/v1/graphql";
export const WATCHMAN_PRICE_FEED = SOMNIA_TESTNET_PRICE_FEED;
export const TUSDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as const;
export const COLLATERAL_DECIMALS = 6 as const;
export const MARKET_STATUS = { Listed: 0, Trading: 1, Locked: 2, Settling: 3, Resolved: 4, Voided: 5 } as const;
export const WATCHMAN_ADDRESSES = {
  collateral: TUSDC,
  testUsdc: TUSDC,
  binaryModule: "0x3ecC694Cef705358864a646142ac17A90E29e388",
  marketsCore: "0x2802504314685D89bF6C992CA5a8e7cC78bc0294",
  clobFactory: "0xb2BE8EE02F96379DB75f01802384593EBa9bfF04",
  binaryPoolImpl: "0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD",
  binarySettlement: "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23",
  collateralRouter: "0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C",
  marketCreatorFactory: "0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B",
  oracleHub: "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b",
  marketCreator: "0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6"
} as const;
export type WatchmanAsset = "BTC" | "ETH";
export type HedgeWindow = 15 | 60;
export interface WatchmanConfig { privateKey?: `0x${string}`; venueId?: `0x${string}`; operatorId?: number; }
export const envConfig = (): WatchmanConfig => ({ privateKey: process.env.PRIVATE_KEY ? (process.env.PRIVATE_KEY as `0x${string}`) : undefined, venueId: process.env.VENUE_ID ? (process.env.VENUE_ID as `0x${string}`) : undefined, operatorId: process.env.OPERATOR_ID ? Number(process.env.OPERATOR_ID) : undefined });
