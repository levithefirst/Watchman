import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  advanceProtection,
  buildView,
  createDemoGateway,
  createDemoPrices,
  demoAuthority,
  demoVerifier,
  demoWallet,
  PublicPriceFeed,
  type EngineDeps,
  type Mode,
  type PriceObservation,
  type ProtectionRecord,
  type ProtectionView,
} from "@watchman/core";
import { payboxConfigured, payboxEnv } from "@watchman/core/live";
import { db, PrismaStore } from "@watchman/db";

export const SESSION_COOKIE = "wm_session";
export const OPERATOR_COOKIE = "wm_operator";

export const store = new PrismaStore(db);

export async function sessionId(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value && /^[a-zA-Z0-9-]{16,64}$/.test(value) ? value : null;
}

function operatorToken(key: string): string {
  return createHash("sha256").update(`watchman-operator:${key}`).digest("hex");
}

export function operatorTokenFor(key: string): string | null {
  const expected = process.env.WATCHMAN_OPERATOR_KEY;
  if (!expected || expected.length < 12) return null;
  const a = Buffer.from(operatorToken(key));
  const b = Buffer.from(operatorToken(expected));
  return a.length === b.length && timingSafeEqual(a, b) ? operatorToken(expected) : null;
}

/**
 * Live mode moves real funds, so it needs two things: PayBox configured on
 * the server, and an operator session proven with WATCHMAN_OPERATOR_KEY.
 * Every other visitor gets demo mode — the same product on simulated rails.
 */
export async function resolveMode(): Promise<{ mode: Mode; liveAvailable: boolean; operator: boolean }> {
  const liveAvailable = payboxConfigured(payboxEnv()) && Boolean(process.env.WATCHMAN_OPERATOR_KEY);
  const expected = process.env.WATCHMAN_OPERATOR_KEY;
  const token = (await cookies()).get(OPERATOR_COOKIE)?.value;
  const operator = Boolean(liveAvailable && expected && token && token === operatorToken(expected));
  return { mode: operator ? "LIVE" : "DEMO", liveAvailable, operator };
}

export function demoDeps(): EngineDeps {
  return { store, prices: createDemoPrices(), authority: demoAuthority, gateway: createDemoGateway(), verifier: demoVerifier, wallet: demoWallet };
}

let cached: { at: number; value: PriceObservation | null } | null = null;
const feed = new PublicPriceFeed({ timeoutMs: 2_500 });

/** Live ETH/USD for previews and arming, cached for five seconds per server instance. */
export async function livePrice(): Promise<PriceObservation | null> {
  if (cached && Date.now() - cached.at < 5_000) return cached.value;
  const value = await feed.latest().catch(() => null);
  cached = { at: Date.now(), value };
  return value;
}

export async function latestFor(ownerId: string): Promise<ProtectionRecord | null> {
  return (await db.protection.findFirst({ where: { ownerId }, orderBy: { createdAt: "desc" } })) as ProtectionRecord | null;
}

export async function viewOf(p: ProtectionRecord): Promise<ProtectionView> {
  const [events, heartbeat] = await Promise.all([store.events(p.id), p.mode === "LIVE" ? db.monitorHeartbeat.findUnique({ where: { id: "live" } }) : null]);
  return buildView(p, events, { now: new Date(), monitorSeenAt: heartbeat?.seenAt ?? null, canSign: p.mode === "DEMO" || Boolean(heartbeat?.canSign) });
}

/**
 * Demo protections have no worker: each read advances them through the same
 * engine the live monitor uses. Concurrent reads are safe — the engine's
 * guarded transitions let exactly one of them win each step.
 */
export async function current(ownerId: string): Promise<ProtectionRecord | null> {
  const p = await latestFor(ownerId);
  if (p && p.mode === "DEMO" && (p.status === "ARMED" || p.status === "EXECUTING")) {
    return (await advanceProtection(p.id, demoDeps())) ?? p;
  }
  return p;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function problem(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

export async function owned(id: string): Promise<{ p: ProtectionRecord; ownerId: string } | Response> {
  const ownerId = await sessionId();
  if (!ownerId) return problem(401, "no_session", "Your session expired. Reload the page to continue.");
  const p = await store.get(id);
  if (!p || p.ownerId !== ownerId) return problem(404, "not_found", "That protection doesn't exist in this session.");
  return { p, ownerId };
}
