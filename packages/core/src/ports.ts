import type { ProtectionRecord } from "./model.js";
import type { PermissionState } from "./trigger.js";
import type { PriceObservation } from "./price.js";

/** PayBox request statuses, as published by @paybox-sh/sdk. */
export type PayboxRequestStatus =
  | "pending_approval"
  | "pending_funding"
  | "pending_signature"
  | "pending_settlement"
  | "pending_confirmation"
  | "success"
  | "denied"
  | "error";

export interface RequestSnapshot {
  requestId: string;
  status: PayboxRequestStatus;
  txHash: string | null;
  approvalUrl: string | null;
  error: string | null;
}

export interface SwapOrder {
  credentialId: string;
  amountWei: bigint;
  /** USD value of the order, which PayBox checks against grant limits. */
  valueCents: number;
}

export type SubmitOutcome =
  /** PayBox accepted the request and returned its id. */
  | { kind: "submitted"; snapshot: RequestSnapshot }
  /** PayBox definitively refused before creating a request. Nothing happened. */
  | { kind: "rejected"; message: string }
  /** The call failed in a way that leaves it unknown whether PayBox created a request. */
  | { kind: "unknown"; message: string };

/**
 * Where swaps go. Live, this is PayBox. Demo, it is a simulator with the same
 * contract, so the engine and UI run identical code either way.
 */
export interface ExecutionGateway {
  readonly label: string;
  /** True for the demo simulator. Audit copy then never claims on-chain activity. */
  readonly simulated?: boolean;
  /** Whether a paired agent signer is available to complete pending_signature in-process. */
  readonly canSign: boolean;
  submitSwap(order: SwapOrder, protection: ProtectionRecord): Promise<SubmitOutcome>;
  getRequest(requestId: string, protection: ProtectionRecord): Promise<RequestSnapshot>;
  /** Signs a request parked in pending_signature. Never creates a new request. */
  completeSignature(requestId: string, protection: ProtectionRecord): Promise<RequestSnapshot>;
}

export type VerificationResult =
  | { kind: "verified"; soldWei: bigint; usdcReceived: bigint; simulated: boolean }
  | { kind: "pending" }
  | { kind: "reverted"; reason: string }
  | { kind: "mismatch"; reason: string };

export interface SettlementVerifier {
  verify(input: { txHash: string | null; walletAddress: string | null; protection: ProtectionRecord; now: Date }): Promise<VerificationResult>;
}

export interface AuthorityPort {
  check(protection: ProtectionRecord): Promise<PermissionState>;
}

export interface WalletPort {
  balanceWei(protection: ProtectionRecord): Promise<bigint>;
}

export interface PriceSource {
  latest(protection: ProtectionRecord): Promise<PriceObservation | null>;
}
