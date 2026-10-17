import { applyBps, weiToCents } from "./money.js";
import type { ProtectionRecord } from "./model.js";
import type { AuthorityPort, ExecutionGateway, PriceSource, RequestSnapshot, SettlementVerifier, SubmitOutcome, SwapOrder, WalletPort } from "./ports.js";
import { demoObservation, demoPriceCents } from "./price.js";

/**
 * Demo adapters. They replace only the edges — market, PayBox, chain — and
 * keep PayBox's real request contract, so a demo protection runs through the
 * exact engine, state machine and screens a live one does. Nothing here
 * produces a transaction hash: a simulated swap is never dressed up as an
 * on-chain one.
 */
export const DEMO_BALANCE_WEI = 2_000_000_000_000_000_000n; // 2 ETH
export const DEMO_CREDENTIAL = { id: "demo-wallet", name: "Demo wallet · Base", approvalMode: "autonomous" } as const;
/** Simulated price impact plus fees on the demo fill. */
export const DEMO_FILL_COST_BPS = 30;

const SIGN_MS = 1_800;
const CONFIRM_MS = 4_200;
const VERIFY_MS = 5_400;

export function createDemoPrices(now: () => Date = () => new Date()): PriceSource {
  return {
    async latest(p) {
      if (p.referencePriceCents == null || !p.armedAt) return null;
      return demoObservation({ referenceCents: p.referencePriceCents, armedAt: p.armedAt, dropAt: p.demoDropAt, now: now() });
    },
  };
}

export const demoAuthority: AuthorityPort = {
  async check(p) {
    return p.payboxCredentialId === DEMO_CREDENTIAL.id ? "granted" : "revoked";
  },
};

export const demoWallet: WalletPort = {
  async balanceWei() {
    return DEMO_BALANCE_WEI;
  },
};

function snapshotAt(p: ProtectionRecord, now: Date): RequestSnapshot {
  const started = p.submitStartedAt?.getTime() ?? now.getTime();
  const elapsed = now.getTime() - started;
  const requestId = `sim-${p.id}`;
  const status = !p.signAttemptedAt || elapsed < SIGN_MS ? "pending_signature" : elapsed < CONFIRM_MS ? "pending_confirmation" : "success";
  return { requestId, status, txHash: null, approvalUrl: null, error: null };
}

export function createDemoGateway(now: () => Date = () => new Date()): ExecutionGateway {
  return {
    label: "PayBox (simulated)",
    canSign: true,
    async submitSwap(order: SwapOrder, p: ProtectionRecord): Promise<SubmitOutcome> {
      if (order.credentialId !== DEMO_CREDENTIAL.id) return { kind: "rejected", message: "credential is not granted to Watchman" };
      return { kind: "submitted", snapshot: snapshotAt(p, now()) };
    },
    async getRequest(_id, p) {
      return snapshotAt(p, now());
    },
    async completeSignature(_id, p) {
      return snapshotAt({ ...p, signAttemptedAt: p.signAttemptedAt ?? now() }, now());
    },
  };
}

export const demoVerifier: SettlementVerifier = {
  async verify({ protection: p, now }) {
    if (!p.sellWei || p.referencePriceCents == null || !p.armedAt || !p.submitStartedAt) return { kind: "mismatch", reason: "the simulated order is incomplete" };
    if (now.getTime() - p.submitStartedAt.getTime() < VERIFY_MS) return { kind: "pending" };
    const sold = BigInt(p.sellWei);
    const marketCents = demoPriceCents({ referenceCents: p.referencePriceCents, armedAt: p.armedAt, dropAt: p.demoDropAt, now: p.submitStartedAt });
    const grossCents = BigInt(weiToCents(sold, marketCents));
    const netCents = grossCents - applyBps(grossCents, DEMO_FILL_COST_BPS);
    return { kind: "verified", soldWei: sold, usdcReceived: netCents * 10_000n, simulated: true };
  },
};
