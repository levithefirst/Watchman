import { distanceBps } from "./money.js";
import { MAX_SOURCE_SPREAD_BPS, type PriceObservation } from "./price.js";

export type PauseReason =
  | "price_unavailable"
  | "price_stale"
  | "price_invalid"
  | "price_disagreement"
  | "permission_revoked";

export type PermissionState = "granted" | "revoked" | "unknown";

export type TriggerDecision =
  | { decision: "trigger"; priceCents: number }
  | { decision: "hold"; priceCents: number; distanceBps: number }
  | { decision: "pause"; reason: PauseReason }
  | { decision: "ignore"; reason: "not_armed" | "already_triggered" };

export interface TriggerInput {
  status: string;
  triggeredAt: Date | null;
  triggerPriceCents: number | null;
  observation: PriceObservation | null;
  permission: PermissionState;
  now: Date;
  maxPriceAgeMs: number;
}

/**
 * The whole trigger rule, as one pure function: act only when the protection
 * is armed, the permission still stands, the price is fresh, sane and
 * corroborated, and that price is at or below the trigger. Every other case
 * holds or pauses. There is no path that sells on missing or doubtful data.
 */
export function evaluateTrigger(input: TriggerInput): TriggerDecision {
  if (input.triggeredAt) return { decision: "ignore", reason: "already_triggered" };
  if (input.status !== "ARMED" || input.triggerPriceCents == null) return { decision: "ignore", reason: "not_armed" };
  if (input.permission === "revoked") return { decision: "pause", reason: "permission_revoked" };

  const obs = input.observation;
  if (!obs) return { decision: "pause", reason: "price_unavailable" };
  const age = input.now.getTime() - obs.observedAt.getTime();
  if (!Number.isFinite(age) || age > input.maxPriceAgeMs || age < -5_000) return { decision: "pause", reason: "price_stale" };
  if (!Number.isSafeInteger(obs.priceCents) || obs.priceCents <= 0) return { decision: "pause", reason: "price_invalid" };
  if (obs.spreadBps > MAX_SOURCE_SPREAD_BPS) return { decision: "pause", reason: "price_disagreement" };

  if (obs.priceCents <= input.triggerPriceCents) return { decision: "trigger", priceCents: obs.priceCents };
  return { decision: "hold", priceCents: obs.priceCents, distanceBps: distanceBps(obs.priceCents, input.triggerPriceCents) };
}

export const PAUSE_COPY: Record<PauseReason, { title: string; detail: string }> = {
  price_unavailable: { title: "Price unavailable — protection paused", detail: "Watchman can't read the ETH price right now. It will not act until a fresh price returns." },
  price_stale: { title: "Price is stale — protection paused", detail: "The latest ETH price is too old to act on. Watchman resumes as soon as a fresh price arrives." },
  price_invalid: { title: "Price rejected — protection paused", detail: "The price feed returned a value that failed validation. Watchman ignores it and keeps waiting." },
  price_disagreement: { title: "Price sources disagree — protection paused", detail: "Coinbase and Kraken differ by more than 1.5%. Watchman won't act until they agree." },
  permission_revoked: { title: "Protection paused — PayBox permission was revoked", detail: "Watchman no longer has access to this wallet in PayBox. Nothing will execute unless access is granted again." },
};
