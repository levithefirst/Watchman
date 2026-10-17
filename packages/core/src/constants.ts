/**
 * The one protection Watchman supports. Every value here is fixed: the policy
 * parser cannot produce anything else, and the executor derives every PayBox
 * parameter from these constants plus the armed policy.
 */
export const BASE_CHAIN_ID = 8453;
/** CAIP-2 id PayBox uses for Base mainnet. */
export const BASE_CAIP2 = "eip155:8453";
/** PayBox's token id for a chain's native asset. */
export const NATIVE_TOKEN = "native";
/** Circle's native USDC on Base. */
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_DECIMALS = 6;
export const ETH_DECIMALS = 18;

/** ERC-20 Transfer(address,address,uint256) topic. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Accepted ranges, in basis points. */
export const DROP_BPS_MIN = 100; // 1%
export const DROP_BPS_MAX = 5_000; // 50%
export const SELL_BPS_MIN = 100; // 1%
/** Native ETH pays its own gas, so Watchman never sells the whole balance. */
export const SELL_BPS_MAX = 9_000; // 90%

/** Slippage Watchman asks PayBox to enforce on the swap quote. */
export const SWAP_SLIPPAGE_BPS = 100; // 1%

export const DEFAULT_INSTRUCTION = "If ETH drops 10%, sell 25% of my ETH to USDC.";
