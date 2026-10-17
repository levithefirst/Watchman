import { APPROVAL_LABELS } from "./approval.js";
import { bpsToPercentLabel, distanceBps, formatEth, formatUsd, formatUsdc, weiToCents } from "./money.js";
import type { AuditEvent, AuditKind, ExecutionStage, Mode, ProtectionRecord, ProtectionStatus } from "./model.js";
import { PAUSE_COPY, type PauseReason } from "./trigger.js";

export type StepState = "done" | "active" | "pending" | "failed";

export interface ProtectionView {
  id: string;
  mode: Mode;
  status: ProtectionStatus;
  stage: ExecutionStage | null;
  instruction: string;
  terms: { drop: string; sell: string; dropBps: number; sellBps: number };
  can: string[];
  cannot: string[];
  prices: {
    reference: string | null;
    trigger: string | null;
    current: string | null;
    currentCents: number | null;
    triggerCents: number | null;
    referenceCents: number | null;
    distance: string | null;
    distanceBps: number | null;
    sources: string | null;
    updatedAt: string | null;
    /** 0 at the reference price, 1 at the trigger. Clamped. */
    progress: number | null;
  };
  health: { state: "live" | "paused" | "interrupted" | "idle"; title: string; detail: string };
  authority: {
    credentialName: string | null;
    wallet: string | null;
    approvalMode: string | null;
    approvalLabel: string | null;
    approvalDetail: string | null;
    maxSell: string;
    maxSellEth: string | null;
    balanceAtArmEth: string | null;
    maxSellUsdAtTrigger: string | null;
  };
  execution: {
    headline: string;
    detail: string;
    steps: Array<{ key: string; label: string; state: StepState; note?: string }>;
    sellEth: string | null;
    requestId: string | null;
    payboxStatus: string | null;
    approvalUrl: string | null;
    actionUrl: string | null;
  } | null;
  receipt: {
    soldEth: string;
    usdcReceived: string;
    executionPrice: string;
    triggerPrice: string;
    observedPrice: string | null;
    txHash: string | null;
    txUrl: string | null;
    requestId: string | null;
    completedAt: string;
    simulated: boolean;
  } | null;
  failure: { code: string; title: string; message: string; fundsMoved: string; nextAction: string; requestId: string | null; txHash: string | null; txUrl: string | null } | null;
  events: Array<{ id: string; kind: AuditKind; title: string; message: string; at: string; txUrl: string | null }>;
  timestamps: { createdAt: string; armedAt: string | null; triggeredAt: string | null; completedAt: string | null; revokedAt: string | null };
}

export const EVENT_TITLES: Record<AuditKind, string> = {
  POLICY_COMPILED: "Policy compiled",
  PERMISSION_GRANTED: "PayBox permission granted",
  PROTECTION_ARMED: "Protection armed",
  REFERENCE_CAPTURED: "Reference price captured",
  MONITORING_PAUSED: "Monitoring paused",
  MONITORING_RESUMED: "Monitoring resumed",
  TRIGGER_CROSSED: "ETH crossed trigger",
  PAYBOX_SUBMITTED: "PayBox request submitted",
  PAYBOX_APPROVAL_REQUIRED: "Approval requested",
  PAYBOX_SIGNATURE_REQUIRED: "Signature requested",
  PAYBOX_SIGNED: "Signed in PayBox",
  PAYBOX_FUNDING_REQUIRED: "Funding required",
  PAYBOX_BROADCAST: "Broadcast to Base",
  TRANSACTION_EXECUTED: "Transaction executed",
  TRANSACTION_VERIFIED: "Transaction verified",
  EXECUTION_FAILED: "Execution failed",
  NEEDS_REVIEW: "Stopped for review",
  PROTECTION_REVOKED: "Protection revoked",
};

const BASESCAN = "https://basescan.org/tx/";
const shortAddress = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null);
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function canCannot(dropBps: number, sellBps: number): { can: string[]; cannot: string[] } {
  return {
    can: [
      "Sell ETH",
      `Up to ${bpsToPercentLabel(sellBps)} of your ETH`,
      "For USDC",
      "On Base",
      `Only when ETH falls ${bpsToPercentLabel(dropBps)} from the reference price`,
    ],
    cannot: [
      "Buy tokens",
      "Sell other assets",
      "Transfer USDC elsewhere",
      "Increase its limit",
      "Change the trigger",
      "Create another protection",
      "Access your private key",
    ],
  };
}

export interface ViewContext {
  now: Date;
  /** Last time the live monitor reported in. Null when unknown. Ignored for demo protections. */
  monitorSeenAt: Date | null;
  canSign: boolean;
  maxPriceAgeMs?: number;
}

function health(p: ProtectionRecord, ctx: ViewContext): ProtectionView["health"] {
  if (p.status !== "ARMED") return { state: "idle", title: "", detail: "" };
  if (p.mode === "LIVE") {
    const seen = ctx.monitorSeenAt?.getTime() ?? 0;
    const age = ctx.now.getTime() - seen;
    if (!ctx.monitorSeenAt || age > 60_000) {
      const mins = ctx.monitorSeenAt ? Math.max(1, Math.round(age / 60_000)) : null;
      return {
        state: "interrupted",
        title: "Monitoring interrupted",
        detail: mins
          ? `Watchman's monitor last checked in ${mins} min ago. Nothing can execute while it is offline; protection resumes when it reconnects.`
          : "Watchman's monitor hasn't checked in yet. Nothing can execute until it does.",
      };
    }
  }
  if (p.pauseReason && p.pauseReason in PAUSE_COPY) {
    const copy = PAUSE_COPY[p.pauseReason as PauseReason];
    return { state: "paused", ...copy };
  }
  if (!p.lastPriceAt || ctx.now.getTime() - p.lastPriceAt.getTime() > (ctx.maxPriceAgeMs ?? 45_000)) {
    return { state: "paused", ...PAUSE_COPY.price_stale };
  }
  return { state: "live", title: "Monitoring", detail: `Watching ETH on ${p.lastPriceSources ?? "live markets"}.` };
}

function execution(p: ProtectionRecord, ctx: ViewContext): ProtectionView["execution"] {
  if (p.status !== "EXECUTING" && !(p.status === "FAILED" && p.triggeredAt) && !(p.status === "COMPLETED")) return null;
  const stage = p.stage;
  const order: ExecutionStage[] = ["SUBMITTING", "PENDING_APPROVAL", "PENDING_SIGNATURE", "PENDING_FUNDING", "SETTLING", "VERIFYING"];
  const at = p.status === "COMPLETED" ? 99 : stage ? order.indexOf(stage) : -1;
  const failed = p.status === "FAILED" || stage === "NEEDS_REVIEW";
  const settleIndex = order.indexOf("SETTLING");
  const verifyIndex = order.indexOf("VERIFYING");

  const executingState: StepState = failed && !p.txHash && at < settleIndex ? "failed" : at >= settleIndex ? "done" : "active";
  const settleState: StepState = at > settleIndex ? "done" : at === settleIndex ? "active" : failed && p.txHash ? "failed" : "pending";
  const verifyState: StepState = p.status === "COMPLETED" ? "done" : at === verifyIndex ? "active" : failed && stage === "NEEDS_REVIEW" && p.txHash ? "failed" : "pending";

  let executingNote = "Requesting the swap";
  if (stage === "PENDING_APPROVAL") executingNote = "Waiting for your approval";
  if (stage === "PENDING_SIGNATURE") executingNote = ctx.canSign || p.mode === "DEMO" ? "Signing in PayBox" : "Signature required";
  if (stage === "PENDING_FUNDING") executingNote = "Waiting for funds";
  if (at >= settleIndex) executingNote = "Signed in PayBox";

  const steps: NonNullable<ProtectionView["execution"]>["steps"] = [
    { key: "triggered", label: "Triggered", state: "done", note: p.triggerObservedCents != null ? `ETH at ${formatUsd(p.triggerObservedCents)}` : undefined },
    { key: "executing", label: "Executing through PayBox", state: executingState, note: executingNote },
    { key: "settling", label: p.mode === "DEMO" ? "Settling (simulated)" : "Confirming on Base", state: settleState },
    { key: "verifying", label: "Verifying", state: verifyState },
  ];

  const signStuck = stage === "PENDING_SIGNATURE" && (!ctx.canSign && p.mode === "LIVE" || (p.signAttemptedAt && ctx.now.getTime() - p.signAttemptedAt.getTime() > 120_000));
  const copy: Record<string, [string, string]> = {
    SUBMITTING: ["Requesting the swap from PayBox", "Watchman is sending the one swap this policy allows. PayBox checks it against your grant."],
    PENDING_APPROVAL: ["Approve in PayBox to continue", "PayBox is holding this swap for your passkey approval. Nothing moves until you approve."],
    PENDING_SIGNATURE: signStuck
      ? ["Signature required to continue", "PayBox cleared the swap and is waiting for it to be signed. Watchman won't sign twice; complete it in PayBox."]
      : ["PayBox is signing the swap", "PayBox cleared the swap within your grant. Signing happens inside PayBox; Watchman never holds your key."],
    PENDING_FUNDING: ["Insufficient funds for this swap", "PayBox reports the wallet can't cover the swap and its network fee. Add ETH on Base; Watchman keeps following this same request."],
    SETTLING: [p.mode === "DEMO" ? "Settling the swap" : "Confirming on Base", p.mode === "DEMO" ? "The simulated swap is settling." : "PayBox broadcast the swap. Waiting for Base to confirm it."],
    VERIFYING: ["Verifying the result", p.mode === "DEMO" ? "Checking the settlement before calling it done." : "Reading the transaction on Base to confirm what was sold and what arrived."],
    NEEDS_REVIEW: ["Watchman stopped to keep your funds safe", p.failureMessage ?? "Watchman couldn't confirm the outcome, so it will not act again."],
  };
  const [headline, detail] = stage ? copy[stage] ?? ["Executing", ""] : ["", ""];
  return {
    headline,
    detail,
    steps,
    sellEth: p.sellWei ? formatEth(p.sellWei) : null,
    requestId: p.payboxRequestId,
    payboxStatus: p.payboxStatus,
    approvalUrl: p.approvalUrl,
    actionUrl: stage === "PENDING_APPROVAL" || signStuck || stage === "PENDING_FUNDING" || stage === "NEEDS_REVIEW" ? p.approvalUrl ?? (p.mode === "LIVE" ? "https://app.paybox.sh" : null) : null,
  };
}

const FAILURE_TITLES: Record<string, string> = {
  paybox_denied: "PayBox did not authorize this action",
  paybox_rejected: "PayBox refused the swap request",
  paybox_error: "PayBox couldn't complete the swap",
  transaction_reverted: "The transaction reverted on Base",
  insufficient_balance: "Insufficient balance",
  balance_unavailable: "Couldn't read the wallet balance",
  policy_incomplete: "The policy was incomplete",
  submission_unconfirmed: "Watchman couldn't confirm the request",
  verification_timeout: "The result couldn't be verified",
  verification_mismatch: "The result couldn't be verified",
  exceeded_authority: "The result exceeded this protection's authority",
  paybox_unknown_status: "PayBox returned an unknown state",
};

function failure(p: ProtectionRecord): ProtectionView["failure"] {
  if (p.status !== "FAILED" && p.stage !== "NEEDS_REVIEW") return null;
  const code = p.failureCode ?? "unknown";
  const fundsMoved =
    p.fundsMoved === "no" ? "No ETH was sold." : p.fundsMoved === "yes" ? "Funds moved. Review the transaction below." : "Unknown. Check PayBox before doing anything else.";
  const next: Record<string, string> = {
    paybox_denied: "Review the grant in PayBox. Create a new protection once Watchman has the access it needs.",
    paybox_rejected: "Check Watchman's grant in PayBox, then create a new protection.",
    paybox_error: "Nothing further will be attempted. Create a new protection to try again.",
    transaction_reverted: "Your ETH is still in your wallet. Create a new protection to try again.",
    insufficient_balance: "Add ETH on Base, then create a new protection.",
    balance_unavailable: "Create a new protection once Base is reachable again.",
    submission_unconfirmed: "Open PayBox and look for this swap before creating another protection.",
    verification_timeout: "Check the transaction in PayBox or on Basescan. Watchman will not act again on this protection.",
    verification_mismatch: "Check the transaction in PayBox or on Basescan. Watchman will not act again on this protection.",
    exceeded_authority: "Revoke Watchman's grant in PayBox and review the transaction.",
  };
  return {
    code,
    title: FAILURE_TITLES[code] ?? "Protection could not execute",
    message: p.failureMessage ?? "Watchman stopped this protection.",
    fundsMoved,
    nextAction: next[code] ?? "Create a new protection when you're ready.",
    requestId: p.payboxRequestId,
    txHash: p.txHash,
    txUrl: p.txHash ? BASESCAN + p.txHash : null,
  };
}

export function buildView(p: ProtectionRecord, events: AuditEvent[], ctx: ViewContext): ProtectionView {
  const current = p.lastPriceCents;
  const trig = p.triggerPriceCents;
  const ref = p.referencePriceCents;
  const dist = current != null && trig != null ? distanceBps(current, trig) : null;
  const progress = current != null && trig != null && ref != null && ref > trig ? Math.min(1, Math.max(0, (ref - current) / (ref - trig))) : null;
  const approval = p.approvalMode ? APPROVAL_LABELS[p.approvalMode] : undefined;
  const { can, cannot } = canCannot(p.dropBps, p.sellBps);

  return {
    id: p.id,
    mode: p.mode,
    status: p.status,
    stage: p.stage,
    instruction: p.instruction,
    terms: { drop: bpsToPercentLabel(p.dropBps), sell: bpsToPercentLabel(p.sellBps), dropBps: p.dropBps, sellBps: p.sellBps },
    can,
    cannot,
    prices: {
      reference: ref != null ? formatUsd(ref) : null,
      trigger: trig != null ? formatUsd(trig) : null,
      current: current != null ? formatUsd(current) : null,
      currentCents: current,
      triggerCents: trig,
      referenceCents: ref,
      distance: dist != null ? bpsToPercentLabel(Math.max(0, Math.round(dist / 10) * 10)) : null,
      distanceBps: dist,
      sources: p.lastPriceSources,
      updatedAt: iso(p.lastPriceAt),
      progress,
    },
    health: health(p, ctx),
    authority: {
      credentialName: p.payboxCredentialName,
      wallet: shortAddress(p.walletAddress),
      approvalMode: p.approvalMode,
      approvalLabel: approval?.label ?? null,
      approvalDetail: approval?.detail ?? null,
      maxSell: `${bpsToPercentLabel(p.sellBps)} of your ETH`,
      maxSellEth: p.maxSellWei ? formatEth(p.maxSellWei) : null,
      balanceAtArmEth: p.balanceAtArmWei ? formatEth(p.balanceAtArmWei) : null,
      maxSellUsdAtTrigger: p.maxSellWei && trig != null ? formatUsd(weiToCents(BigInt(p.maxSellWei), trig)) : null,
    },
    execution: execution(p, ctx),
    receipt:
      p.status === "COMPLETED" && p.soldWei && p.usdcReceived
        ? {
            soldEth: formatEth(p.soldWei, 6),
            usdcReceived: formatUsdc(p.usdcReceived),
            executionPrice: formatUsd(p.executionPriceCents),
            triggerPrice: formatUsd(p.triggerPriceCents),
            observedPrice: p.triggerObservedCents != null ? formatUsd(p.triggerObservedCents) : null,
            txHash: p.txHash,
            txUrl: p.txHash ? BASESCAN + p.txHash : null,
            requestId: p.payboxRequestId,
            completedAt: (p.completedAt ?? p.updatedAt).toISOString(),
            simulated: p.mode === "DEMO",
          }
        : null,
    failure: failure(p),
    events: events
      .slice()
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((e) => ({ id: e.id, kind: e.kind, title: EVENT_TITLES[e.kind] ?? e.kind, message: e.message, at: e.at.toISOString(), txUrl: e.txHash ? BASESCAN + e.txHash : null })),
    timestamps: { createdAt: p.createdAt.toISOString(), armedAt: iso(p.armedAt), triggeredAt: iso(p.triggeredAt), completedAt: iso(p.completedAt), revokedAt: iso(p.revokedAt) },
  };
}
