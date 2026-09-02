import { createWatchmanContext, discoverTradingMarkets } from "@watchman/sdk";

const intervalMs = Number(process.env.SETTLEMENT_POLL_MS ?? 15_000);

async function tick(): Promise<void> {
  const ctx = createWatchmanContext(Boolean(process.env.PRIVATE_KEY));
  try {
    const markets = await discoverTradingMarkets(ctx);
    console.log(JSON.stringify({ at: new Date().toISOString(), chainId: 50312, tradingMarkets: markets.length }));
  } finally {
    await ctx.exchange.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  console.log("Watchman agent started on Somnia Shannon testnet (50312)");
  await tick();
  setInterval(() => void tick().catch((error: unknown) => console.error(error)), intervalMs);
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
