import { ETH_DECIMALS, USDC_DECIMALS } from "./constants.js";

/**
 * All money math is integer math. Prices are whole US cents, percentages are
 * basis points, ETH is wei and USDC is its 6-decimal atomic unit. Nothing that
 * decides whether or how much to sell ever touches a float.
 */

export const BPS = 10_000n;

/** Floor of value × bps / 10 000. Flooring can only ever sell less, never more. */
export function applyBps(value: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`invalid bps ${bps}`);
  if (value < 0n) throw new RangeError("negative amount");
  return (value * BigInt(bps)) / BPS;
}

/** "10" → 1000, "12.5" → 1250. Returns null for anything that isn't a plain percentage with ≤ 2 decimals. */
export function percentToBps(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = Number((match[2] ?? "").padEnd(2, "0"));
  return whole * 100 + frac;
}

export function bpsToPercentLabel(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return `${whole}%`;
  return `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}%`;
}

/** Parses a positive USD decimal ("3842.17") to integer cents, rounding half up. */
export function usdToCents(value: string | number): number | null {
  const text = typeof value === "number" ? value.toFixed(6) : value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fracDigits = (match[2] ?? "").padEnd(3, "0");
  const cents = Number(fracDigits.slice(0, 2));
  const roundUp = Number(fracDigits[2]) >= 5 ? 1 : 0;
  const result = whole * 100 + cents + roundUp;
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export function formatUsd(cents: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (cents == null) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100);
  const rest = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  if (opts.compact && rest === 0) return `${sign}$${grouped}`;
  return `${sign}$${grouped}.${String(rest).padStart(2, "0")}`;
}

function formatUnits(value: bigint, decimals: number, maxFraction: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let fraction = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction);
  fraction = fraction.replace(/0+$/, "");
  const text = fraction ? `${whole.toLocaleString("en-US")}.${fraction}` : whole.toLocaleString("en-US");
  return negative ? `-${text}` : text;
}

export function formatEth(wei: bigint | string | null | undefined, maxFraction = 4): string {
  if (wei == null) return "—";
  return formatUnits(BigInt(wei), ETH_DECIMALS, maxFraction);
}

export function formatUsdc(atomic: bigint | string | null | undefined, maxFraction = 2): string {
  if (atomic == null) return "—";
  return formatUnits(BigInt(atomic), USDC_DECIMALS, maxFraction);
}

/** USD value, in cents, of `wei` at `priceCents` per ETH. Floors. */
export function weiToCents(wei: bigint, priceCents: number): number {
  return Number((wei * BigInt(priceCents)) / 10n ** BigInt(ETH_DECIMALS));
}

/** Effective price in cents per ETH of a fill: usdc received ÷ eth sold. */
export function fillPriceCents(soldWei: bigint, usdcAtomic: bigint): number | null {
  if (soldWei <= 0n) return null;
  // usdc (1e6) → cents (1e2): ×1e-4; per ETH: ×1e18 ÷ wei.
  return Number((usdcAtomic * 10n ** 14n) / soldWei);
}

/** Signed distance from `price` down to `trigger`, in basis points of `price`. */
export function distanceBps(priceCents: number, triggerCents: number): number {
  if (priceCents <= 0) return 0;
  return Math.floor(((priceCents - triggerCents) * 10_000) / priceCents);
}
