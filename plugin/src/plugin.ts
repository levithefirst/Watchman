import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { BASE_CAIP2, NATIVE_TOKEN, SWAP_SLIPPAGE_BPS, USDC_BASE } from "../../packages/core/src/constants.js";
import { bpsToPercentLabel, formatEth, formatUsd, percentToBps, usdToCents, weiToCents } from "../../packages/core/src/money.js";
import { describeTerms, maxSellFor, parseInstruction, sellAmountFor, triggerPriceFor } from "../../packages/core/src/policy.js";
import { PublicPriceFeed } from "../../packages/core/src/price.js";
import { evaluateTrigger, PAUSE_COPY, type PauseReason } from "../../packages/core/src/trigger.js";
import { canCannot } from "../../packages/core/src/view.js";

/**
 * Watchman as a PayBox plugin. It compiles one protective exit rule, watches
 * its trigger, and — only once the trigger has really crossed — hands the
 * agent the exact request_swap PayBox should run. It never arms, signs or
 * submits anything itself: PayBox keeps the wallet, the grant and the approval.
 * The policy grammar and trigger rule are the same code the Watchman app runs.
 */
const PROTOCOL_VERSION = "2026-07-28";
const WATCHMAN_URL = (process.env.WATCHMAN_URL || "https://watchman-beta.vercel.app").replace(/\/+$/, "");
const MAX_PRICE_AGE_MS = 30_000;

const percentInput = (min: number, max: number) => z.number().min(min).max(max);
const priceInput = z.number().positive().max(1_000_000).describe("ETH price in USD captured when the protection was set, e.g. 3842.17");

function bpsOf(value: number): number | null {
  return percentToBps(String(value));
}

const unsupported = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

const policySchema = z.object({
  asset: z.literal("ETH"),
  destinationAsset: z.literal("USDC"),
  chain: z.literal("base"),
  dropPercent: z.number(),
  sellPercent: z.number(),
}).strict();

function createServer() {
  const server = new McpServer(
    { name: "watchman", version: "1.0.0" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );

  server.registerTool(
    "compile_protection",
    {
      title: "Compile a Watchman protection",
      description:
        "Turns one sentence like \"If ETH drops 10%, sell 25% of my ETH to USDC\" into Watchman's fixed policy: one asset (ETH), one trigger (a percentage drop from the reference price), one action (sell a share of ETH for USDC on Base). Anything else is rejected with the reason. Returns what Watchman can and cannot do, and a link where the user reviews and arms it themselves.",
      inputSchema: z.object({ instruction: z.string().min(1).max(200) }).strict(),
      outputSchema: z.object({
        supported: z.boolean(),
        policy: policySchema.nullable(),
        summary: z.string(),
        can: z.array(z.string()),
        cannot: z.array(z.string()),
        reviewUrl: z.string().nullable(),
        rejection: z.object({ code: z.string(), message: z.string() }).strict().nullable(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ instruction }) => {
      const parsed = parseInstruction(instruction);
      if (!parsed.ok) {
        return {
          content: [{ type: "text", text: parsed.message }],
          structuredContent: { supported: false, policy: null, summary: parsed.message, can: [], cannot: [], reviewUrl: null, rejection: { code: parsed.code, message: parsed.message } },
        };
      }
      const { dropBps, sellBps } = parsed.terms;
      const scope = canCannot(dropBps, sellBps);
      const summary = describeTerms(parsed.terms);
      const reviewUrl = `${WATCHMAN_URL}/?instruction=${encodeURIComponent(summary)}`;
      return {
        content: [{
          type: "text",
          text: `${summary}\nWatchman can: ${scope.can.join("; ")}.\nWatchman cannot: ${scope.cannot.join("; ")}.\nThe user reviews and arms it at ${reviewUrl} — an agent cannot arm a protection.`,
        }],
        structuredContent: {
          supported: true,
          policy: { asset: "ETH", destinationAsset: "USDC", chain: "base", dropPercent: dropBps / 100, sellPercent: sellBps / 100 },
          summary,
          can: scope.can,
          cannot: scope.cannot,
          reviewUrl,
          rejection: null,
        },
      };
    },
  );

  const checkOutput = z.object({
    decision: z.enum(["hold", "trigger", "pause"]),
    referencePrice: z.string(),
    triggerPrice: z.string(),
    currentPrice: z.string().nullable(),
    distanceToTrigger: z.string().nullable(),
    sources: z.array(z.string()),
    observedAt: z.string().nullable(),
    pause: z.object({ reason: z.string(), title: z.string(), detail: z.string() }).strict().nullable(),
  }).strict();

  async function check(referencePrice: number, dropPercent: number) {
    const referenceCents = usdToCents(referencePrice);
    const dropBps = bpsOf(dropPercent);
    if (!referenceCents) return { ok: false, error: "referencePrice must be a positive USD amount." } as const;
    if (dropBps == null || dropBps < 100 || dropBps > 5_000) return { ok: false, error: "dropPercent must be between 1 and 50 with at most two decimals." } as const;
    const triggerCents = triggerPriceFor(referenceCents, dropBps);
    const observation = await new PublicPriceFeed({ timeoutMs: 4_000 }).latest().catch(() => null);
    const decision = evaluateTrigger({ status: "ARMED", triggeredAt: null, triggerPriceCents: triggerCents, observation, permission: "granted", now: new Date(), maxPriceAgeMs: MAX_PRICE_AGE_MS });
    const pause = decision.decision === "pause" ? { reason: decision.reason, ...PAUSE_COPY[decision.reason as PauseReason] } : null;
    const out = {
      decision: decision.decision === "ignore" ? "pause" : decision.decision,
      referencePrice: formatUsd(referenceCents),
      triggerPrice: formatUsd(triggerCents),
      currentPrice: observation ? formatUsd(observation.priceCents) : null,
      distanceToTrigger: decision.decision === "hold" ? bpsToPercentLabel(Math.max(0, Math.round(decision.distanceBps / 10) * 10)) : decision.decision === "trigger" ? "0%" : null,
      sources: observation?.quotes.map((q) => q.source) ?? [],
      observedAt: observation?.observedAt.toISOString() ?? null,
      pause,
    } as const;
    return { ok: true, out, observation, triggerCents } as const;
  }

  server.registerTool(
    "check_eth_trigger",
    {
      title: "Check a Watchman trigger",
      description:
        "Reads live ETH/USD from Coinbase and Kraken and applies Watchman's trigger rule: act only when the price is fresh, corroborated by every answering source, and at or below referencePrice × (1 − dropPercent). Returns hold, trigger or pause (with the reason). Read-only.",
      inputSchema: z.object({ referencePrice: priceInput, dropPercent: percentInput(1, 50) }).strict(),
      outputSchema: checkOutput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ referencePrice, dropPercent }) => {
      const r = await check(referencePrice, dropPercent);
      if (!r.ok) return unsupported(r.error);
      const o = r.out;
      const text =
        o.decision === "trigger"
          ? `Triggered: ETH is ${o.currentPrice}, at or below the ${o.triggerPrice} trigger.`
          : o.decision === "hold"
            ? `Holding: ETH is ${o.currentPrice}, ${o.distanceToTrigger} above the ${o.triggerPrice} trigger.`
            : `${o.pause?.title}. ${o.pause?.detail}`;
      return { content: [{ type: "text", text }], structuredContent: o };
    },
  );

  server.registerTool(
    "plan_protective_exit",
    {
      title: "Plan the protective ETH → USDC exit",
      description:
        "Only when the live trigger has crossed, returns the exact PayBox request_swap arguments for this protection: native ETH → USDC on Base, exact amount in, the policy's share of the given balance capped at maxSellWei. Otherwise returns ready: false and why. Submit the request once, keep its request_id and poll get_request; never call request_swap again for the same trigger. This tool does not submit or sign anything.",
      inputSchema: z.object({
        referencePrice: priceInput,
        dropPercent: percentInput(1, 50),
        sellPercent: percentInput(1, 90),
        ethBalanceWei: z.string().regex(/^(0|[1-9][0-9]{0,40})$/).describe("Current native ETH balance on Base, in wei"),
        maxSellWei: z.string().regex(/^(0|[1-9][0-9]{0,40})$/).optional().describe("Ceiling fixed when the protection was armed, in wei"),
      }).strict(),
      outputSchema: z.object({
        ready: z.boolean(),
        check: checkOutput,
        sell: z.object({ amountWei: z.string(), amountEth: z.string(), valueUsd: z.string() }).strict().nullable(),
        requestSwap: z.object({
          src_chain: z.string(),
          dst_chain: z.string(),
          src_token: z.string(),
          dst_token: z.string(),
          amount: z.string(),
          swap_direction: z.literal("exact-amount-in"),
          slippage_bps: z.number(),
          value_cents: z.number(),
        }).strict().nullable(),
        guidance: z.string(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ referencePrice, dropPercent, sellPercent, ethBalanceWei, maxSellWei }) => {
      const sellBps = bpsOf(sellPercent);
      if (sellBps == null || sellBps < 100 || sellBps > 9_000) return unsupported("sellPercent must be between 1 and 90 with at most two decimals.");
      const r = await check(referencePrice, dropPercent);
      if (!r.ok) return unsupported(r.error);
      if (r.out.decision !== "trigger" || !r.observation) {
        const guidance = r.out.decision === "hold" ? `Not triggered. ETH is ${r.out.distanceToTrigger} above the trigger. Do not swap.` : `Paused: ${r.out.pause?.title}. Do not swap.`;
        return { content: [{ type: "text", text: guidance }], structuredContent: { ready: false, check: r.out, sell: null, requestSwap: null, guidance } };
      }
      const balance = BigInt(ethBalanceWei);
      const ceiling = maxSellWei != null ? BigInt(maxSellWei) : maxSellFor(balance, sellBps);
      const amount = sellAmountFor(balance, sellBps, ceiling);
      if (amount <= 0n) {
        const guidance = "Triggered, but there is no ETH to sell within this protection's limit. Do not swap.";
        return { content: [{ type: "text", text: guidance }], structuredContent: { ready: false, check: r.out, sell: null, requestSwap: null, guidance } };
      }
      const valueCents = weiToCents(amount, r.observation.priceCents);
      const guidance =
        `Call PayBox request_swap once with these arguments and the user's granted Base wallet as credential_id. Keep the returned request_id and poll get_request until success, denied or error. If the call fails or times out, check get_request before doing anything else — never submit a second swap for this trigger.`;
      return {
        content: [{ type: "text", text: `Triggered at ${r.out.currentPrice}. Sell ${formatEth(amount)} ETH (${bpsToPercentLabel(sellBps)}) for USDC on Base.\n${guidance}` }],
        structuredContent: {
          ready: true,
          check: r.out,
          sell: { amountWei: amount.toString(), amountEth: formatEth(amount, 6), valueUsd: formatUsd(valueCents) },
          requestSwap: {
            src_chain: BASE_CAIP2,
            dst_chain: BASE_CAIP2,
            src_token: NATIVE_TOKEN,
            dst_token: USDC_BASE,
            amount: amount.toString(),
            swap_direction: "exact-amount-in" as const,
            slippage_bps: SWAP_SLIPPAGE_BPS,
            value_cents: valueCents,
          },
          guidance,
        },
      };
    },
  );

  server.registerTool(
    "get_protection_status",
    {
      title: "Get a Watchman protection's status",
      description: "Reads one protection from Watchman by id: whether it is monitoring, triggered, executing through PayBox, complete or failed, with its prices and verified receipt. Read-only; an agent cannot change a protection.",
      inputSchema: z.object({ protectionId: z.string().regex(/^[a-z0-9]{20,40}$/) }).strict(),
      outputSchema: z.object({
        id: z.string(),
        mode: z.string(),
        status: z.string(),
        stage: z.string().nullable(),
        instruction: z.string(),
        referencePrice: z.string().nullable(),
        triggerPrice: z.string().nullable(),
        currentPrice: z.string().nullable(),
        headline: z.string(),
        receipt: z.object({ soldEth: z.string(), usdcReceived: z.string(), executionPrice: z.string(), txHash: z.string().nullable(), simulated: z.boolean() }).strict().nullable(),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ protectionId }) => {
      let body: Record<string, any>;
      try {
        const res = await fetch(`${WATCHMAN_URL}/api/public/protection/${protectionId}`, { signal: AbortSignal.timeout(4_000), headers: { accept: "application/json" } });
        if (res.status === 404) return unsupported("No Watchman protection with that id.");
        if (!res.ok) return unsupported(`Watchman answered ${res.status}. Try again shortly.`);
        body = (await res.json()) as Record<string, any>;
      } catch {
        return unsupported("Watchman couldn't be reached. Try again shortly.");
      }
      const headline =
        body.status === "ARMED" ? (body.health?.state === "live" ? "Monitoring" : body.health?.title ?? "Paused")
          : body.status === "EXECUTING" ? body.execution?.headline ?? "Executing through PayBox"
            : body.status === "COMPLETED" ? "Protection executed and verified"
              : body.status === "FAILED" ? body.failure?.title ?? "Protection could not execute"
                : body.status === "REVOKED" ? "Protection revoked" : "Draft — not armed";
      const r = body.receipt;
      const out = {
        id: String(body.id),
        mode: String(body.mode),
        status: String(body.status),
        stage: body.stage ?? null,
        instruction: String(body.instruction ?? ""),
        referencePrice: body.prices?.reference ?? null,
        triggerPrice: body.prices?.trigger ?? null,
        currentPrice: body.prices?.current ?? null,
        headline: String(headline),
        receipt: r ? { soldEth: String(r.soldEth), usdcReceived: String(r.usdcReceived), executionPrice: String(r.executionPrice), txHash: r.txHash ?? null, simulated: Boolean(r.simulated) } : null,
      };
      return { content: [{ type: "text", text: `${out.headline}. ${out.instruction}` }], structuredContent: out };
    },
  );

  return server;
}

serveStdio(createServer, { legacy: "reject" });
