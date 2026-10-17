import type { AuditEvent, AuditInput, Mode, ProtectionRecord, ProtectionStore } from "./model.js";
import type { PolicyTerms } from "./policy.js";

/** Kinds that may legitimately happen more than once in a protection's life. */
export const REPEATABLE_KINDS = new Set(["MONITORING_PAUSED", "MONITORING_RESUMED"]);

export function blankProtection(input: { id: string; ownerId: string; mode: Mode; instruction: string; terms: PolicyTerms; now: Date }): ProtectionRecord {
  return {
    id: input.id,
    ownerId: input.ownerId,
    mode: input.mode,
    status: "DRAFT",
    stage: null,
    instruction: input.instruction,
    dropBps: input.terms.dropBps,
    sellBps: input.terms.sellBps,
    payboxCredentialId: null,
    payboxCredentialName: null,
    approvalMode: null,
    walletAddress: null,
    referencePriceCents: null,
    triggerPriceCents: null,
    balanceAtArmWei: null,
    maxSellWei: null,
    armedAt: null,
    lastPriceCents: null,
    lastPriceAt: null,
    lastPriceSources: null,
    pauseReason: null,
    permissionCheckedAt: null,
    demoDropAt: null,
    triggeredAt: null,
    triggerObservedCents: null,
    sellWei: null,
    submitStartedAt: null,
    payboxRequestId: null,
    payboxStatus: null,
    approvalUrl: null,
    signAttemptedAt: null,
    txHash: null,
    soldWei: null,
    usdcReceived: null,
    executionPriceCents: null,
    verifiedAt: null,
    failureCode: null,
    failureMessage: null,
    fundsMoved: null,
    completedAt: null,
    revokedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

/**
 * Reference implementation of ProtectionStore. Single-threaded JS makes each
 * transition atomic, which is exactly the guarantee the Postgres store gives
 * with a conditional UPDATE.
 */
export class MemoryStore implements ProtectionStore {
  readonly rows = new Map<string, ProtectionRecord>();
  readonly events: AuditEvent[] = [];
  private seq = 0;

  put(p: ProtectionRecord): void {
    this.rows.set(p.id, { ...p });
  }

  async get(id: string): Promise<ProtectionRecord | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async transition(id: string, guard: Partial<ProtectionRecord>, patch: Partial<ProtectionRecord>): Promise<ProtectionRecord | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    for (const [key, value] of Object.entries(guard)) {
      if (!same(row[key as keyof ProtectionRecord], value)) return null;
    }
    const next = { ...row, ...patch, updatedAt: new Date() };
    this.rows.set(id, next);
    return { ...next };
  }

  async record(id: string, event: AuditInput): Promise<void> {
    if (!REPEATABLE_KINDS.has(event.kind) && this.events.some((e) => e.protectionId === id && e.kind === event.kind)) return;
    this.events.push({ ...event, id: `ev${++this.seq}`, protectionId: id, at: event.at ?? new Date() });
  }

  eventsFor(id: string): AuditEvent[] {
    return this.events.filter((e) => e.protectionId === id);
  }
}
