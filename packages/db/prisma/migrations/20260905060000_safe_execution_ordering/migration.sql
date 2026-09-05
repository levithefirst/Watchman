-- Make an on-chain order recoverable if persistence fails afterwards.
--
-- Before this, /api/protect executed the IOC and only then wrote the hedge.
-- A Prisma failure after execution destroyed every link between the spent
-- funds and the application, with no way to reconcile.
--
--   EXECUTING          a distinct status meaning "order sent, outcome
--                      unknown". Rows here are the reconciliation target and
--                      must never be read as "never executed".
--   idempotencyKey     unique per protect attempt, so a retry after a lost
--                      response cannot place a second order.
--   executionStartedAt when the order was sent, for operator triage.

ALTER TYPE "HedgeStatus" ADD VALUE IF NOT EXISTS 'EXECUTING' BEFORE 'OPEN';

ALTER TABLE "Hedge" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Hedge" ADD COLUMN IF NOT EXISTS "executionStartedAt" TIMESTAMP(3);

-- Partial-free unique index: NULLs stay distinct in Postgres, so existing and
-- demo rows without a key are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "Hedge_idempotencyKey_key" ON "Hedge"("idempotencyKey");
