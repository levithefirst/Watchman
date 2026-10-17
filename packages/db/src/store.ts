import { Prisma, type PrismaClient } from "@prisma/client";
import { REPEATABLE_KINDS, type AuditEvent, type AuditInput, type AuditKind, type ProtectionRecord, type ProtectionStore } from "@watchman/core";
import { randomUUID } from "node:crypto";

/**
 * ProtectionStore on Postgres. Each transition is one conditional UPDATE
 * (`WHERE id = ? AND <guard>`), so the database — not the application —
 * decides which of several concurrent callers wins a step.
 */
export class PrismaStore implements ProtectionStore {
  constructor(private readonly db: PrismaClient) {}

  async get(id: string): Promise<ProtectionRecord | null> {
    return (await this.db.protection.findUnique({ where: { id } })) as ProtectionRecord | null;
  }

  async transition(id: string, guard: Partial<ProtectionRecord>, patch: Partial<ProtectionRecord>): Promise<ProtectionRecord | null> {
    const { count } = await this.db.protection.updateMany({
      where: { id, ...(guard as Prisma.ProtectionWhereInput) },
      data: patch as Prisma.ProtectionUpdateManyMutationInput,
    });
    return count === 1 ? this.get(id) : null;
  }

  async record(id: string, event: AuditInput): Promise<void> {
    await this.db.auditEvent.createMany({
      data: [
        {
          protectionId: id,
          kind: event.kind,
          dedupeKey: REPEATABLE_KINDS.has(event.kind) ? `${event.kind}:${randomUUID()}` : event.kind,
          message: event.message,
          priceCents: event.priceCents ?? null,
          amount: event.amount ?? null,
          requestId: event.requestId ?? null,
          txHash: event.txHash ?? null,
          metadata: (event.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          at: event.at ?? new Date(),
        },
      ],
      skipDuplicates: true,
    });
  }

  async events(id: string): Promise<AuditEvent[]> {
    const rows = await this.db.auditEvent.findMany({ where: { protectionId: id }, orderBy: { at: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      protectionId: r.protectionId,
      kind: r.kind as AuditKind,
      message: r.message,
      priceCents: r.priceCents,
      amount: r.amount,
      requestId: r.requestId,
      txHash: r.txHash,
      metadata: r.metadata as Record<string, unknown> | null,
      at: r.at,
    }));
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
