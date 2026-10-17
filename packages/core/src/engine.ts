import { formatEth, formatUsd, fillPriceCents, weiToCents } from "./money.js";
import type { ExecutionStage, ProtectionRecord, ProtectionStore } from "./model.js";
import { maxSellFor, sellAmountFor, triggerPriceFor } from "./policy.js";
import type { AuthorityPort, ExecutionGateway, PriceSource, RequestSnapshot, SettlementVerifier, WalletPort } from "./ports.js";
import { evaluateTrigger, PAUSE_COPY, type PauseReason, type PermissionState } from "./trigger.js";

export interface EngineConfig {
  /** A price older than this never triggers anything. */
  maxPriceAgeMs: number;
  /** How often an armed protection re-confirms its PayBox grant. Always re-checked at trigger time. */
  permissionRecheckMs: number;
  /** How long a started PayBox submission may run before its outcome is treated as unknown. */
  submitLeaseMs: number;
  /** How long to keep retrying a failed balance read after the trigger before giving up. */
  balanceRetryMs: number;
  /** How long after PayBox reports success to wait for the transaction to be visible on Base. */
  verifyTimeoutMs: number;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  maxPriceAgeMs: 30_000,
  permissionRecheckMs: 5 * 60_000,
  submitLeaseMs: 10 * 60_000,
  balanceRetryMs: 2 * 60_000,
  verifyTimeoutMs: 15 * 60_000,
};

export interface EngineDeps {
  store: ProtectionStore;
  prices: PriceSource;
  authority: AuthorityPort;
  gateway: ExecutionGateway;
  verifier: SettlementVerifier;
  wallet: WalletPort;
  now?: () => Date;
  config?: Partial<EngineConfig>;
  log?: (event: string, data: Record<string, unknown>) => void;
}

interface Ctx {
  deps: EngineDeps;
  cfg: EngineConfig;
  now: Date;
  log: (event: string, data: Record<string, unknown>) => void;
}

async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Moves one protection forward as far as it can go right now, then returns
 * its latest state. Safe to call from any number of processes at once and
 * any number of times: every step is a guarded transition, so a step either
 * happens exactly once or not at all, and a PayBox request is only ever
 * created by the single caller that won the submission claim.
 */
export async function advanceProtection(id: string, deps: EngineDeps): Promise<ProtectionRecord | null> {
  const ctx: Ctx = {
    deps,
    cfg: { ...DEFAULT_ENGINE_CONFIG, ...deps.config },
    now: (deps.now ?? (() => new Date()))(),
    log: deps.log ?? (() => undefined),
  };
  let current = await deps.store.get(id);
  // A trigger can carry straight through submission and an immediate PayBox
  // answer in one call; the loop stops as soon as a step leaves state as is.
  for (let i = 0; current && i < 6; i++) {
    const next = await step(current, ctx);
    if (!next || (next.status === current.status && next.stage === current.stage)) return next ?? current;
    current = next;
  }
  return current;
}

async function step(p: ProtectionRecord, ctx: Ctx): Promise<ProtectionRecord | null> {
  if (p.status === "ARMED") return monitor(p, ctx);
  if (p.status !== "EXECUTING") return p;
  switch (p.stage) {
    case "SUBMITTING":
      return submit(p, ctx);
    case "PENDING_APPROVAL":
    case "PENDING_SIGNATURE":
    case "PENDING_FUNDING":
    case "SETTLING":
      return follow(p, ctx);
    case "VERIFYING":
      return verify(p, ctx);
    // NEEDS_REVIEW is a deliberate dead end. Watchman reached a point where it
    // couldn't prove what happened, so it takes no further action of any kind.
    default:
      return p;
  }
}

// ---------------------------------------------------------------- monitoring

async function monitor(p: ProtectionRecord, ctx: Ctx): Promise<ProtectionRecord | null> {
  const { deps, cfg, now } = ctx;
  const previous: PermissionState = p.pauseReason === "permission_revoked" ? "revoked" : "granted";
  let permission = previous;
  let checkedAt = p.permissionCheckedAt;
  const due = !p.permissionCheckedAt || now.getTime() - p.permissionCheckedAt.getTime() >= cfg.permissionRecheckMs;
  if (due) {
    const checked = await attempt(() => deps.authority.check(p));
    if (checked.ok && checked.value !== "unknown") permission = checked.value;
    checkedAt = now;
  }

  const priced = await attempt(() => deps.prices.latest(p));
  const observation = priced.ok ? priced.value : null;
  let decision = evaluateTrigger({ ...p, observation, permission, now, maxPriceAgeMs: cfg.maxPriceAgeMs });

  // Never sell on a grant checked minutes ago: confirm it at the moment of action.
  if (decision.decision === "trigger" && !due) {
    const checked = await attempt(() => deps.authority.check(p));
    checkedAt = now;
    if (checked.ok && checked.value === "revoked") {
      permission = "revoked";
      decision = { decision: "pause", reason: "permission_revoked" };
    }
  }

  const priceFields = observation
    ? { lastPriceCents: observation.priceCents, lastPriceAt: observation.observedAt, lastPriceSources: observation.quotes.map((q) => q.source).join(" + ") }
    : {};

  if (decision.decision === "trigger") {
    const won = await deps.store.transition(
      p.id,
      { status: "ARMED", triggeredAt: null },
      { ...priceFields, status: "EXECUTING", stage: "SUBMITTING", triggeredAt: now, triggerObservedCents: decision.priceCents, pauseReason: null, permissionCheckedAt: checkedAt },
    );
    if (!won) return deps.store.get(p.id);
    await deps.store.record(p.id, {
      kind: "TRIGGER_CROSSED",
      message: `ETH reached ${formatUsd(decision.priceCents)}, at or below the ${formatUsd(p.triggerPriceCents)} trigger.`,
      priceCents: decision.priceCents,
      at: now,
    });
    ctx.log("trigger_crossed", { id: p.id, priceCents: decision.priceCents, triggerPriceCents: p.triggerPriceCents });
    return won;
  }

  const pauseReason: PauseReason | null = decision.decision === "pause" ? decision.reason : null;
  const updated = await deps.store.transition(p.id, { status: "ARMED" }, { ...priceFields, pauseReason, permissionCheckedAt: checkedAt });
  if (updated && pauseReason !== p.pauseReason) {
    if (pauseReason) {
      await deps.store.record(p.id, { kind: "MONITORING_PAUSED", message: PAUSE_COPY[pauseReason].title, at: now });
    } else if (p.pauseReason) {
      await deps.store.record(p.id, { kind: "MONITORING_RESUMED", message: "Monitoring resumed with a fresh, verified price.", at: now });
    }
  }
  return updated ?? deps.store.get(p.id);
}

// ---------------------------------------------------------------- execution

async function fail(
  p: ProtectionRecord,
  ctx: Ctx,
  guard: Partial<ProtectionRecord>,
  code: string,
  message: string,
  fundsMoved: "no" | "yes" | "unknown",
  extra: Partial<ProtectionRecord> = {},
): Promise<ProtectionRecord | null> {
  const failed = await ctx.deps.store.transition(p.id, { status: "EXECUTING", ...guard }, {
    ...extra,
    status: "FAILED",
    stage: null,
    failureCode: code,
    failureMessage: message,
    fundsMoved,
    completedAt: ctx.now,
  });
  if (failed) {
    await ctx.deps.store.record(p.id, { kind: "EXECUTION_FAILED", message, requestId: failed.payboxRequestId, txHash: failed.txHash, metadata: { code, fundsMoved }, at: ctx.now });
    ctx.log("execution_failed", { id: p.id, code, fundsMoved });
  }
  return failed ?? ctx.deps.store.get(p.id);
}

async function needsReview(
  p: ProtectionRecord,
  ctx: Ctx,
  guard: Partial<ProtectionRecord>,
  code: string,
  message: string,
  fundsMoved: "no" | "yes" | "unknown",
  extra: Partial<ProtectionRecord> = {},
): Promise<ProtectionRecord | null> {
  const held = await ctx.deps.store.transition(p.id, { status: "EXECUTING", ...guard }, { ...extra, stage: "NEEDS_REVIEW", failureCode: code, failureMessage: message, fundsMoved });
  if (held) {
    await ctx.deps.store.record(p.id, { kind: "NEEDS_REVIEW", message, requestId: held.payboxRequestId, txHash: held.txHash, metadata: { code, fundsMoved }, at: ctx.now });
    ctx.log("needs_review", { id: p.id, code });
  }
  return held ?? ctx.deps.store.get(p.id);
}

async function submit(p: ProtectionRecord, ctx: Ctx): Promise<ProtectionRecord | null> {
  const { deps, cfg, now } = ctx;
  if (p.payboxRequestId) return follow(p, ctx);

  if (p.submitStartedAt) {
    // Someone claimed the submission and never recorded PayBox's answer. While
    // that call could still be running, wait. After the lease, the honest
    // answer is "unknown" — and an unknown request is never submitted again.
    if (now.getTime() - p.submitStartedAt.getTime() < cfg.submitLeaseMs) return p;
    return needsReview(
      p, ctx, { stage: "SUBMITTING", submitStartedAt: p.submitStartedAt, payboxRequestId: null },
      "submission_unconfirmed",
      "Watchman started a PayBox request but never received confirmation of it. It will not submit another. Check your PayBox activity for this swap.",
      "unknown",
    );
  }

  if (!p.payboxCredentialId || !p.maxSellWei || p.triggerObservedCents == null) {
    return fail(p, ctx, { stage: "SUBMITTING", submitStartedAt: null }, "policy_incomplete", "The armed policy is missing its PayBox credential or limits, so Watchman refused to act. No swap was submitted.", "no");
  }

  const balance = await attempt(() => deps.wallet.balanceWei(p));
  if (!balance.ok) {
    const since = p.triggeredAt ? now.getTime() - p.triggeredAt.getTime() : 0;
    if (since < cfg.balanceRetryMs) return p;
    return fail(p, ctx, { stage: "SUBMITTING", submitStartedAt: null }, "balance_unavailable", "Watchman couldn't read the wallet's ETH balance on Base, so it couldn't size the sale. No swap was submitted.", "no");
  }

  const amount = sellAmountFor(balance.value, p.sellBps, BigInt(p.maxSellWei));
  if (amount <= 0n) {
    return fail(p, ctx, { stage: "SUBMITTING", submitStartedAt: null }, "insufficient_balance", "The wallet holds no ETH on Base for Watchman to sell. No swap was submitted.", "no");
  }

  // The claim. Exactly one caller gets past this line for a given protection.
  const claimed = await deps.store.transition(p.id, { status: "EXECUTING", stage: "SUBMITTING", submitStartedAt: null, payboxRequestId: null }, { submitStartedAt: now, sellWei: amount.toString() });
  if (!claimed) return deps.store.get(p.id);
  const guard = { stage: "SUBMITTING" as ExecutionStage, submitStartedAt: now };

  const outcome = await attempt(() =>
    deps.gateway.submitSwap({ credentialId: p.payboxCredentialId!, amountWei: amount, valueCents: weiToCents(amount, p.triggerObservedCents!) }, claimed),
  );
  if (!outcome.ok || outcome.value.kind === "unknown") {
    const reason = !outcome.ok ? outcome.error : outcome.value.kind === "unknown" ? outcome.value.message : "";
    ctx.log("submit_unknown", { id: p.id, reason });
    return needsReview(claimed, ctx, guard, "submission_unconfirmed", "Watchman couldn't confirm whether PayBox received the swap request, so it will not submit another. Check your PayBox activity for this swap.", "unknown");
  }
  if (outcome.value.kind === "rejected") {
    return fail(claimed, ctx, guard, "paybox_rejected", `PayBox refused the request: ${outcome.value.message}. No swap was submitted.`, "no");
  }

  const snapshot = outcome.value.snapshot;
  await deps.store.record(p.id, {
    kind: "PAYBOX_SUBMITTED",
    message: `Requested a swap of ${formatEth(amount)} ETH for USDC through ${deps.gateway.label}.`,
    amount: amount.toString(),
    requestId: snapshot.requestId,
    at: now,
  });
  ctx.log("paybox_submitted", { id: p.id, requestId: snapshot.requestId, status: snapshot.status });
  return applySnapshot(claimed, snapshot, guard, ctx);
}

async function follow(p: ProtectionRecord, ctx: Ctx): Promise<ProtectionRecord | null> {
  const { deps, now } = ctx;
  const requestId = p.payboxRequestId;
  if (!requestId) return p;

  if (p.stage === "PENDING_SIGNATURE" && deps.gateway.canSign && !p.signAttemptedAt) {
    const claimed = await deps.store.transition(p.id, { status: "EXECUTING", stage: "PENDING_SIGNATURE", signAttemptedAt: null }, { signAttemptedAt: now });
    if (!claimed) return deps.store.get(p.id);
    const signed = await attempt(() => deps.gateway.completeSignature(requestId, claimed));
    const snapshot = signed.ok ? signed.value : await attempt(() => deps.gateway.getRequest(requestId, claimed)).then((r) => (r.ok ? r.value : null));
    if (!snapshot) return claimed;
    return applySnapshot(claimed, snapshot, { stage: "PENDING_SIGNATURE" }, ctx);
  }

  const read = await attempt(() => deps.gateway.getRequest(requestId, p));
  if (!read.ok) {
    ctx.log("paybox_poll_failed", { id: p.id, requestId, error: read.error });
    return p;
  }
  return applySnapshot(p, read.value, { stage: p.stage }, ctx);
}

const STAGE_FOR: Record<string, ExecutionStage> = {
  pending_approval: "PENDING_APPROVAL",
  pending_signature: "PENDING_SIGNATURE",
  pending_funding: "PENDING_FUNDING",
  pending_settlement: "SETTLING",
  pending_confirmation: "SETTLING",
  success: "VERIFYING",
};

/** Folds one PayBox request snapshot into the protection. PayBox is the source of truth for request state. */
async function applySnapshot(p: ProtectionRecord, s: RequestSnapshot, guard: Partial<ProtectionRecord>, ctx: Ctx): Promise<ProtectionRecord | null> {
  const { deps, now } = ctx;
  const base = {
    payboxRequestId: s.requestId,
    payboxStatus: s.status,
    approvalUrl: s.approvalUrl ?? p.approvalUrl,
    txHash: s.txHash ?? p.txHash,
  };

  if (s.status === "denied") {
    return fail(p, ctx, guard, "paybox_denied", `PayBox did not authorize this action${s.error ? `: ${s.error}` : "."} No swap took place.`, "no", base);
  }
  if (s.status === "error") {
    const message = base.txHash
      ? `The swap transaction failed or was dropped${s.error ? ` (${s.error})` : ""}. PayBox reports no ETH was swapped; network fees may have been spent.`
      : `PayBox couldn't complete the swap${s.error ? `: ${s.error}` : "."} No transaction was sent.`;
    return fail(p, ctx, guard, "paybox_error", message, "no", base);
  }

  const stage = STAGE_FOR[s.status];
  if (!stage) return needsReview(p, ctx, guard, "paybox_unknown_status", `PayBox returned a status Watchman doesn't recognize (${s.status}). Nothing further will be submitted.`, "unknown", base);

  if (stage === p.stage) {
    const changed = base.payboxStatus !== p.payboxStatus || base.approvalUrl !== p.approvalUrl || base.txHash !== p.txHash || p.payboxRequestId !== s.requestId;
    return changed ? (await deps.store.transition(p.id, { status: "EXECUTING", ...guard }, base)) ?? deps.store.get(p.id) : p;
  }

  const moved = await deps.store.transition(p.id, { status: "EXECUTING", ...guard }, { ...base, stage, failureCode: null, failureMessage: null, fundsMoved: null });
  if (!moved) return deps.store.get(p.id);

  const sim = deps.gateway.simulated === true;
  const event = {
    PENDING_APPROVAL: { kind: "PAYBOX_APPROVAL_REQUIRED", message: "PayBox is asking you to approve this swap with your passkey." },
    PENDING_SIGNATURE: {
      kind: "PAYBOX_SIGNATURE_REQUIRED",
      message: deps.gateway.canSign ? "PayBox cleared the swap within your grant and opened its signing window." : "PayBox cleared the swap. A signature is required to continue.",
    },
    PENDING_FUNDING: { kind: "PAYBOX_FUNDING_REQUIRED", message: "PayBox reports the wallet can't fund this swap yet." },
    SETTLING: { kind: "PAYBOX_BROADCAST", message: sim ? "The simulated swap is settling. Nothing is broadcast in demo mode." : "PayBox broadcast the swap to Base and is waiting for confirmation." },
    VERIFYING: { kind: "TRANSACTION_EXECUTED", message: sim ? "The simulated PayBox reports the swap settled." : "PayBox reports the swap confirmed on Base." },
  } as const;
  if (p.stage === "PENDING_SIGNATURE" && (stage === "SETTLING" || stage === "VERIFYING")) {
    await deps.store.record(p.id, {
      kind: "PAYBOX_SIGNED",
      message: sim ? "The simulated PayBox signer signed the swap. No key or wallet was involved." : "PayBox signed the swap inside its signing window. Your wallet's private key never left PayBox.",
      requestId: s.requestId,
      at: now,
    });
  }
  const e = event[stage as keyof typeof event];
  if (e) await deps.store.record(p.id, { kind: e.kind, message: e.message, requestId: s.requestId, txHash: base.txHash, at: now });
  return moved;
}

async function verify(p: ProtectionRecord, ctx: Ctx): Promise<ProtectionRecord | null> {
  const { deps, cfg, now } = ctx;
  const guard = { stage: "VERIFYING" as ExecutionStage };
  const result = await attempt(() => deps.verifier.verify({ txHash: p.txHash, walletAddress: p.walletAddress, protection: p, now }));
  if (!result.ok) return p;
  const r = result.value;

  if (r.kind === "pending") {
    const since = p.triggeredAt ? now.getTime() - p.triggeredAt.getTime() : 0;
    if (since < cfg.verifyTimeoutMs) return p;
    return needsReview(p, ctx, guard, "verification_timeout", "PayBox reported the swap as confirmed, but Watchman couldn't find the transaction on Base to verify it. It is not marked complete.", "unknown");
  }
  if (r.kind === "reverted") {
    return fail(p, ctx, guard, "transaction_reverted", `The transaction reverted on Base: ${r.reason}. No ETH was swapped; network fees may have been spent.`, "no");
  }
  if (r.kind === "mismatch") {
    return needsReview(p, ctx, guard, "verification_mismatch", `Watchman couldn't verify the result: ${r.reason}. It is not marked complete.`, "unknown");
  }

  // The last line of defence: a verified fill must sit inside the authority
  // fixed at arming. If it doesn't, nothing about this run is trustworthy.
  if (p.maxSellWei && r.soldWei > BigInt(p.maxSellWei)) {
    return needsReview(p, ctx, guard, "exceeded_authority", `The transaction sold ${formatEth(r.soldWei)} ETH, more than the ${formatEth(p.maxSellWei)} ETH this protection allows.`, "yes");
  }

  const completed = await deps.store.transition(p.id, { status: "EXECUTING", ...guard }, {
    status: "COMPLETED",
    stage: null,
    soldWei: r.soldWei.toString(),
    usdcReceived: r.usdcReceived.toString(),
    executionPriceCents: fillPriceCents(r.soldWei, r.usdcReceived),
    verifiedAt: now,
    completedAt: now,
    fundsMoved: "yes",
  });
  if (!completed) return deps.store.get(p.id);
  await deps.store.record(p.id, {
    kind: "TRANSACTION_VERIFIED",
    message: r.simulated
      ? "Settlement verified against the simulated ledger."
      : "Verified on Base: the transaction succeeded and USDC arrived in your wallet.",
    amount: r.usdcReceived.toString(),
    txHash: p.txHash,
    requestId: p.payboxRequestId,
    at: now,
  });
  ctx.log("verified", { id: p.id, txHash: p.txHash, soldWei: r.soldWei.toString(), usdc: r.usdcReceived.toString() });
  return completed;
}

// ---------------------------------------------------------------- user actions

export interface ArmInput {
  referencePriceCents: number;
  referenceSources: string;
  balanceWei: bigint;
  credentialId: string;
  credentialName: string;
  approvalMode: string;
  walletAddress: string | null;
  now: Date;
}

export type ArmResult = { ok: true; protection: ProtectionRecord } | { ok: false; code: string; message: string };

/**
 * DRAFT → ARMED. This is the moment the policy freezes: the reference price,
 * trigger and maximum sell amount are derived here, once, and the guarded
 * transition only succeeds against an unarmed draft.
 */
export async function armProtection(store: ProtectionStore, draft: ProtectionRecord, input: ArmInput): Promise<ArmResult> {
  if (draft.status !== "DRAFT") return { ok: false, code: "not_draft", message: "This protection is already armed. Revoke it and create a new one to change anything." };
  const maxSell = maxSellFor(input.balanceWei, draft.sellBps);
  if (maxSell <= 0n) return { ok: false, code: "no_balance", message: "This wallet holds no ETH on Base, so there is nothing to protect yet." };
  const triggerPriceCents = triggerPriceFor(input.referencePriceCents, draft.dropBps);

  const armed = await store.transition(draft.id, { status: "DRAFT" }, {
    status: "ARMED",
    payboxCredentialId: input.credentialId,
    payboxCredentialName: input.credentialName,
    approvalMode: input.approvalMode,
    walletAddress: input.walletAddress,
    referencePriceCents: input.referencePriceCents,
    triggerPriceCents,
    balanceAtArmWei: input.balanceWei.toString(),
    maxSellWei: maxSell.toString(),
    armedAt: input.now,
    permissionCheckedAt: input.now,
    lastPriceCents: input.referencePriceCents,
    lastPriceAt: input.now,
    lastPriceSources: input.referenceSources,
  });
  if (!armed) return { ok: false, code: "not_draft", message: "This protection changed while arming. Reload and try again." };

  await store.record(draft.id, { kind: "PERMISSION_GRANTED", message: `PayBox granted Watchman scoped access to ${input.credentialName}.`, metadata: { approvalMode: input.approvalMode }, at: input.now });
  await store.record(draft.id, { kind: "REFERENCE_CAPTURED", message: `Reference price captured at ${formatUsd(input.referencePriceCents)} (${input.referenceSources}).`, priceCents: input.referencePriceCents, at: input.now });
  await store.record(draft.id, {
    kind: "PROTECTION_ARMED",
    message: `Protection armed. Watchman may sell up to ${formatEth(maxSell)} ETH if ETH reaches ${formatUsd(triggerPriceCents)}.`,
    amount: maxSell.toString(),
    priceCents: triggerPriceCents,
    at: input.now,
  });
  return { ok: true, protection: armed };
}

export type RevokeResult = { ok: true; protection: ProtectionRecord } | { ok: false; code: string; message: string };

export async function revokeProtection(store: ProtectionStore, p: ProtectionRecord, now: Date): Promise<RevokeResult> {
  if (p.status === "EXECUTING") {
    return { ok: false, code: "executing", message: "This protection already triggered and its swap request is with PayBox. Revoking now can't recall it — deny it in PayBox if it is still awaiting your approval." };
  }
  if (p.status !== "ARMED" && p.status !== "DRAFT") return { ok: false, code: "finished", message: "This protection has already finished." };
  const revoked = await store.transition(p.id, { status: p.status, triggeredAt: null }, { status: "REVOKED", revokedAt: now, stage: null });
  if (!revoked) return { ok: false, code: "changed", message: "This protection changed while revoking. Reload to see its current state." };
  await store.record(p.id, { kind: "PROTECTION_REVOKED", message: "Protection revoked. Watchman will take no further action on this policy.", at: now });
  return { ok: true, protection: revoked };
}
