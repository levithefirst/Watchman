/**
 * The protection record, as the engine sees it. It mirrors the database row
 * one-to-one (see packages/db/prisma/schema.prisma); amounts in wei and USDC
 * atomic units are decimal strings because they exceed 2^53.
 */
export type Mode = "DEMO" | "LIVE";

export type ProtectionStatus = "DRAFT" | "ARMED" | "EXECUTING" | "COMPLETED" | "FAILED" | "REVOKED";

/** Where an EXECUTING protection is. Each maps to exactly one PayBox state or one Watchman step. */
export type ExecutionStage =
  | "SUBMITTING"
  | "PENDING_APPROVAL"
  | "PENDING_SIGNATURE"
  | "PENDING_FUNDING"
  | "SETTLING"
  | "VERIFYING"
  | "NEEDS_REVIEW";

export interface ProtectionRecord {
  id: string;
  ownerId: string;
  mode: Mode;
  status: ProtectionStatus;
  stage: ExecutionStage | null;
  instruction: string;
  dropBps: number;
  sellBps: number;

  // Authority, set when the user grants permission.
  payboxCredentialId: string | null;
  payboxCredentialName: string | null;
  approvalMode: string | null;
  walletAddress: string | null;

  // Fixed at arming. Never written again.
  referencePriceCents: number | null;
  triggerPriceCents: number | null;
  balanceAtArmWei: string | null;
  maxSellWei: string | null;
  armedAt: Date | null;

  // Monitoring.
  lastPriceCents: number | null;
  lastPriceAt: Date | null;
  lastPriceSources: string | null;
  pauseReason: string | null;
  permissionCheckedAt: Date | null;
  demoDropAt: Date | null;

  // Execution.
  triggeredAt: Date | null;
  triggerObservedCents: number | null;
  sellWei: string | null;
  submitStartedAt: Date | null;
  payboxRequestId: string | null;
  payboxStatus: string | null;
  approvalUrl: string | null;
  signAttemptedAt: Date | null;
  txHash: string | null;
  soldWei: string | null;
  usdcReceived: string | null;
  executionPriceCents: number | null;
  verifiedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  fundsMoved: string | null; // "no" | "yes" | "unknown"

  completedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AuditKind =
  | "POLICY_COMPILED"
  | "PERMISSION_GRANTED"
  | "PROTECTION_ARMED"
  | "REFERENCE_CAPTURED"
  | "MONITORING_PAUSED"
  | "MONITORING_RESUMED"
  | "TRIGGER_CROSSED"
  | "PAYBOX_SUBMITTED"
  | "PAYBOX_APPROVAL_REQUIRED"
  | "PAYBOX_SIGNATURE_REQUIRED"
  | "PAYBOX_SIGNED"
  | "PAYBOX_FUNDING_REQUIRED"
  | "PAYBOX_BROADCAST"
  | "TRANSACTION_EXECUTED"
  | "TRANSACTION_VERIFIED"
  | "EXECUTION_FAILED"
  | "NEEDS_REVIEW"
  | "PROTECTION_REVOKED";

export interface AuditInput {
  kind: AuditKind;
  message: string;
  priceCents?: number | null;
  amount?: string | null;
  requestId?: string | null;
  txHash?: string | null;
  metadata?: Record<string, unknown> | null;
  at?: Date;
}

export interface AuditEvent extends AuditInput {
  id: string;
  protectionId: string;
  at: Date;
}

/**
 * Persistence for the engine. `transition` is the only way state moves: it
 * applies `patch` only if every field in `guard` still has the given value,
 * atomically, and reports whether it won. Two workers, a restart and a
 * concurrent page poll can all race on the same protection; exactly one wins
 * each step.
 */
export interface ProtectionStore {
  get(id: string): Promise<ProtectionRecord | null>;
  transition(id: string, guard: Partial<ProtectionRecord>, patch: Partial<ProtectionRecord>): Promise<ProtectionRecord | null>;
  /** Appends an audit event. Idempotent per (protection, kind) except for the repeatable pause/resume kinds. */
  record(id: string, event: AuditInput): Promise<void>;
}
