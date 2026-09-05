import { NextResponse } from "next/server";
import { createWatchmanContext, faucetTUSDC } from "@watchman/sdk";
import { logApiError, safeMessage } from "../_errors";

export async function POST(): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "The development faucet helper is disabled in production." }, { status: 403 });
  try {
    const ctx = createWatchmanContext(true);
    try {
      const hash = await faucetTUSDC(ctx);
      return NextResponse.json({ hash: hash ?? null, wallet: ctx.walletAddress ?? null });
    } finally {
      await ctx.exchange.close().catch(() => undefined);
    }
  } catch (error) {
    logApiError("faucet_failed", error);
    const message = safeMessage(error, "Unable to fund wallet");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
