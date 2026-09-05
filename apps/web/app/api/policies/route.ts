import { NextResponse } from "next/server";
import { db } from "@watchman/db";
import { logApiError, safeMessage } from "../_errors";

interface PolicyBody { wallet?: string; demo?: boolean; asset: "BTC" | "ETH"; protectionPct: number; windowSeconds: 900 | 3600; maxPremiumUsd: number }
const valid = (value: unknown): value is PolicyBody => { if (!value || typeof value !== "object") return false; const body = value as Record<string, unknown>; return (body.asset === "BTC" || body.asset === "ETH") && typeof body.protectionPct === "number" && (body.windowSeconds === 900 || body.windowSeconds === 3600) && typeof body.maxPremiumUsd === "number"; };
const walletKey = (body: PolicyBody): string => body.demo ? "demo" : (body.wallet ?? "").toLowerCase();

export async function GET(request: Request): Promise<NextResponse> {
  const wallet = new URL(request.url).searchParams.get("wallet")?.toLowerCase() ?? "demo";
  const user = await db.user.findUnique({ where: { wallet }, include: { policies: { orderBy: { createdAt: "desc" } } } });
  return NextResponse.json({ policies: user?.policies ?? [] });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw: unknown = await request.json();
    if (!valid(raw)) return NextResponse.json({ error: "Invalid policy" }, { status: 400 });
    if (raw.protectionPct < 0.1 || raw.protectionPct > 1 || raw.maxPremiumUsd <= 0) return NextResponse.json({ error: "Invalid policy limits" }, { status: 400 });
    const wallet = walletKey(raw);
    if (!wallet) return NextResponse.json({ error: "Wallet is required" }, { status: 400 });
    const user = await db.user.upsert({ where: { wallet }, update: { demo: raw.demo === true }, create: { wallet, demo: raw.demo === true } });
    const policy = await db.policy.create({ data: { userId: user.id, asset: raw.asset, protectionPct: raw.protectionPct, windowSeconds: raw.windowSeconds, maxPremiumUsd: raw.maxPremiumUsd, status: "ACTIVE" } });
    return NextResponse.json({ policy });
  } catch (error) { logApiError("policy_failed", error); return NextResponse.json({ error: safeMessage(error, "Unable to save policy") }, { status: 500 }); }
}
