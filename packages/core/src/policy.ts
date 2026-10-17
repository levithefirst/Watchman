import { DROP_BPS_MAX, DROP_BPS_MIN, SELL_BPS_MAX, SELL_BPS_MIN } from "./constants.js";
import { applyBps, bpsToPercentLabel, percentToBps } from "./money.js";

/**
 * The only policy shape Watchman supports: one asset, one trigger, one action.
 * There is deliberately no field for an amount, address, chain or token beyond
 * these literals, so nothing downstream can be talked into a different trade.
 */
export interface PolicyTerms {
  asset: "ETH";
  destinationAsset: "USDC";
  chain: "base";
  /** Drop from the reference price that fires the exit, in basis points. */
  dropBps: number;
  /** Share of the ETH balance to sell, in basis points. */
  sellBps: number;
}

export type ParseFailureCode =
  | "empty"
  | "too_long"
  | "unsupported_asset"
  | "unsupported_destination"
  | "unsupported_direction"
  | "unsupported_action"
  | "missing_percent"
  | "malformed_percent"
  | "drop_out_of_range"
  | "sell_out_of_range"
  | "unrecognized";

export type ParseResult =
  | { ok: true; terms: PolicyTerms }
  | { ok: false; code: ParseFailureCode; message: string };

const SUPPORTED_SHAPE = "Watchman currently protects ETH with a percentage-drop exit only.";
const EXAMPLE = "Try: “If ETH drops 10%, sell 25% of my ETH to USDC.”";

const ETH = "(?:eth|ether|ethereum)";
const NUM = "([^\\s%]+?)";
const PCT = "\\s*(?:%|percent\\b|per\\s+cent\\b)";
const FALL = "(?:drops|drop|falls|fall|declines|decline|dips|dip|decreases|decrease|goes\\s+down|is\\s+down|crashes|crash)";

const CONDITION = new RegExp(
  `\\b${ETH}(?:'s)?(?:\\s+price)?\\s+${FALL}(?:\\s+by)?\\s+${NUM}${PCT}(?:\\s+or\\s+more)?` +
    `(?:\\s+(?:from|below)\\s+(?:here|now|today|the\\s+(?:current|reference)\\s+price|current\\s+levels?))?`,
  "i",
);
const ACTION = new RegExp(
  `\\b(?:sell|swap|convert|exit)\\s+${NUM}${PCT}` +
    `(?:\\s+of\\s+(?:my\\s+|the\\s+)?(?:${ETH}|it|position|holdings|bag|stack)(?:\\s+(?:position|holdings))?)?` +
    `\\s+(?:to|for|into)\\s+([a-z0-9.$]+)`,
  "i",
);

/** Words that may surround the two clauses without changing their meaning. */
const FILLER = new Set([
  "if", "when", "whenever", "once", "then", "and", "please", "automatically", "watchman",
  "the", "price", "of", "my",
]);

const OTHER_ASSETS = /\b(btc|bitcoin|sol|solana|usdt|tether|dai|weth|steth|cbeth|matic|pol|arb|op|link|uni|doge|pepe|xrp|bnb|avax|ada|nft|nfts)\b/i;
const OTHER_ACTIONS = /\b(buy|purchase|rebalance|transfer|send|withdraw|bridge|borrow|lend|stake|unstake|deposit|short|long|leverage|hedge|trade|ape|pay|approve|mint)\b/i;
const RISE = /\b(rises?|goes\s+up|pumps?|increases?|climbs?|gains?|is\s+up|above|moons?|spikes?)\b/i;
const VAGUE = /\b(volatile|volatility|crash(?:es)?\s+hard|dumps?|tanks?|gets\s+bad|whenever\s+you\s+think|best|optimal|smart)\b/i;

function fail(code: ParseFailureCode, message: string): ParseResult {
  return { ok: false, code, message };
}

function percent(raw: string, which: "drop" | "sell"): { bps: number } | ParseResult {
  const bps = percentToBps(raw);
  if (bps == null) {
    return fail("malformed_percent", `“${raw}%” isn't a percentage Watchman can use. Use a plain number like 10% or 12.5%.`);
  }
  if (which === "drop" && (bps < DROP_BPS_MIN || bps > DROP_BPS_MAX)) {
    return fail("drop_out_of_range", `Choose a drop between ${bpsToPercentLabel(DROP_BPS_MIN)} and ${bpsToPercentLabel(DROP_BPS_MAX)}.`);
  }
  if (which === "sell" && (bps < SELL_BPS_MIN || bps > SELL_BPS_MAX)) {
    return fail(
      "sell_out_of_range",
      `Choose to sell between ${bpsToPercentLabel(SELL_BPS_MIN)} and ${bpsToPercentLabel(SELL_BPS_MAX)}. Watchman always leaves ETH behind to pay network fees.`,
    );
  }
  return { bps };
}

/**
 * Compiles one natural-language instruction into PolicyTerms, or explains
 * exactly why it can't. This is a strict grammar, not a model: the same text
 * always yields the same policy, and anything outside the supported shape is
 * rejected rather than approximated.
 */
export function parseInstruction(input: string): ParseResult {
  const text = input.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  if (!text) return fail("empty", `Describe the protection you want. ${EXAMPLE}`);
  if (text.length > 200) return fail("too_long", `Keep it to one sentence. ${EXAMPLE}`);

  const condition = CONDITION.exec(text);
  const action = ACTION.exec(text);

  if (!condition || !action) {
    if (OTHER_ACTIONS.test(text)) return fail("unsupported_action", `${SUPPORTED_SHAPE} Watchman can only sell ETH for USDC.`);
    if (RISE.test(text)) return fail("unsupported_direction", `${SUPPORTED_SHAPE} It acts on drops, not rises.`);
    if (OTHER_ASSETS.test(text) && !new RegExp(`\\b${ETH}\\b`, "i").test(text)) {
      return fail("unsupported_asset", `${SUPPORTED_SHAPE} Other assets aren't supported.`);
    }
    if (VAGUE.test(text)) return fail("unrecognized", `${SUPPORTED_SHAPE} ${EXAMPLE}`);
    if (!/%|percent/i.test(text) && /\d/.test(text)) {
      return fail("missing_percent", `Watchman needs percentages for both the drop and the sale. ${EXAMPLE}`);
    }
    return fail("unrecognized", `${SUPPORTED_SHAPE} ${EXAMPLE}`);
  }

  const destination = action[2]!.toLowerCase().replace(/[.$]+$/, "");
  if (destination !== "usdc") {
    return fail("unsupported_destination", `${SUPPORTED_SHAPE} It can only sell into USDC.`);
  }

  const drop = percent(condition[1]!, "drop");
  if ("ok" in drop) return drop;
  const sell = percent(action[1]!, "sell");
  if ("ok" in sell) return sell;

  // Everything that isn't one of the two clauses must be harmless filler.
  // This is what stops "…to USDC and send it to 0xabc" from compiling into a
  // policy that silently ignores the second half.
  const residue = text
    .replace(condition[0], " ")
    .replace(action[0], " ")
    .replace(/[,.;:!?"]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word && !FILLER.has(word));
  if (residue.length > 0) {
    if (OTHER_ACTIONS.test(residue.join(" "))) {
      return fail("unsupported_action", `${SUPPORTED_SHAPE} Watchman can only sell ETH for USDC, nothing else.`);
    }
    return fail("unrecognized", `Watchman didn't understand “${residue.slice(0, 4).join(" ")}”. ${SUPPORTED_SHAPE}`);
  }

  return { ok: true, terms: { asset: "ETH", destinationAsset: "USDC", chain: "base", dropBps: drop.bps, sellBps: sell.bps } };
}

/** triggerPrice = referencePrice × (1 − drop). Floored to the cent. */
export function triggerPriceFor(referencePriceCents: number, dropBps: number): number {
  if (!Number.isSafeInteger(referencePriceCents) || referencePriceCents <= 0) throw new RangeError("invalid reference price");
  return Math.floor((referencePriceCents * (10_000 - dropBps)) / 10_000);
}

/** The hard ceiling on what Watchman may ever sell, fixed when the protection is armed. */
export function maxSellFor(balanceWei: bigint, sellBps: number): bigint {
  return applyBps(balanceWei, sellBps);
}

/**
 * The exact amount to sell at execution time: the policy's share of what the
 * wallet holds now, and never more than the ceiling fixed at arming. If the
 * user has moved ETH out since, Watchman sells less, not the old amount.
 */
export function sellAmountFor(currentBalanceWei: bigint, sellBps: number, maxSellWei: bigint): bigint {
  const share = applyBps(currentBalanceWei, sellBps);
  return share < maxSellWei ? share : maxSellWei;
}

export function describeTerms(terms: Pick<PolicyTerms, "dropBps" | "sellBps">): string {
  return `If ETH drops ${bpsToPercentLabel(terms.dropBps)}, sell ${bpsToPercentLabel(terms.sellBps)} of my ETH to USDC.`;
}
