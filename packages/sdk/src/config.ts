export const WATCHMAN_CHAIN_ID = 50312 as const;
export const WATCHMAN_RPC_URL = "https://api.infra.testnet.somnia.network";
export const WATCHMAN_INDEXER_URL = "https://dev.smk.somnia.host/v1/graphql";
export const TUSDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as const;
export const COLLATERAL_DECIMALS = 6 as const;
export const MARKET_STATUS = { Listed: 0, Trading: 1, Locked: 2, Settling: 3, Resolved: 4, Voided: 5 } as const;
export type WatchmanAsset = "BTC" | "ETH";
export type HedgeWindow = 15 | 60;
export interface WatchmanConfig { privateKey?: `0x${string}`; venueId?: `0x${string}`; operatorId?: number; }
export const envConfig = (): WatchmanConfig => ({
  privateKey: process.env.PRIVATE_KEY ? (process.env.PRIVATE_KEY as `0x${string}`) : undefined,
  venueId: process.env.VENUE_ID ? (process.env.VENUE_ID as `0x${string}`) : undefined,
  operatorId: process.env.OPERATOR_ID ? Number(process.env.OPERATOR_ID) : undefined,
});
