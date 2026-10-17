-- Watchman moves from DreamDEX hedges to one PayBox-scoped ETH protection.
-- The hedge domain is obsolete; its tables are dropped, not migrated.

-- CreateEnum
CREATE TYPE "Mode" AS ENUM ('DEMO', 'LIVE');

-- CreateEnum
CREATE TYPE "ProtectionStatus" AS ENUM ('DRAFT', 'ARMED', 'EXECUTING', 'COMPLETED', 'FAILED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ExecutionStage" AS ENUM ('SUBMITTING', 'PENDING_APPROVAL', 'PENDING_SIGNATURE', 'PENDING_FUNDING', 'SETTLING', 'VERIFYING', 'NEEDS_REVIEW');

-- DropForeignKey
ALTER TABLE IF EXISTS "Exposure" DROP CONSTRAINT IF EXISTS "Exposure_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Hedge" DROP CONSTRAINT IF EXISTS "Hedge_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Hedge" DROP CONSTRAINT IF EXISTS "Hedge_exposureId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Receipt" DROP CONSTRAINT IF EXISTS "Receipt_hedgeId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Policy" DROP CONSTRAINT IF EXISTS "Policy_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "User";

-- DropTable
DROP TABLE IF EXISTS "Exposure";

-- DropTable
DROP TABLE IF EXISTS "Hedge";

-- DropTable
DROP TABLE IF EXISTS "Receipt";

-- DropTable
DROP TABLE IF EXISTS "Policy";

-- DropEnum
DROP TYPE IF EXISTS "Asset";

-- DropEnum
DROP TYPE IF EXISTS "HedgeStatus";

-- DropEnum
DROP TYPE IF EXISTS "PolicyStatus";

-- CreateTable
CREATE TABLE "Protection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mode" "Mode" NOT NULL,
    "status" "ProtectionStatus" NOT NULL DEFAULT 'DRAFT',
    "stage" "ExecutionStage",
    "instruction" TEXT NOT NULL,
    "dropBps" INTEGER NOT NULL,
    "sellBps" INTEGER NOT NULL,
    "payboxCredentialId" TEXT,
    "payboxCredentialName" TEXT,
    "approvalMode" TEXT,
    "walletAddress" TEXT,
    "referencePriceCents" INTEGER,
    "triggerPriceCents" INTEGER,
    "balanceAtArmWei" TEXT,
    "maxSellWei" TEXT,
    "armedAt" TIMESTAMP(3),
    "lastPriceCents" INTEGER,
    "lastPriceAt" TIMESTAMP(3),
    "lastPriceSources" TEXT,
    "pauseReason" TEXT,
    "permissionCheckedAt" TIMESTAMP(3),
    "demoDropAt" TIMESTAMP(3),
    "triggeredAt" TIMESTAMP(3),
    "triggerObservedCents" INTEGER,
    "sellWei" TEXT,
    "submitStartedAt" TIMESTAMP(3),
    "payboxRequestId" TEXT,
    "payboxStatus" TEXT,
    "approvalUrl" TEXT,
    "signAttemptedAt" TIMESTAMP(3),
    "txHash" TEXT,
    "soldWei" TEXT,
    "usdcReceived" TEXT,
    "executionPriceCents" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "fundsMoved" TEXT,
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Protection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "protectionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priceCents" INTEGER,
    "amount" TEXT,
    "requestId" TEXT,
    "txHash" TEXT,
    "metadata" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorHeartbeat" (
    "id" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "priceCents" INTEGER,
    "priceAt" TIMESTAMP(3),
    "sources" TEXT,
    "canSign" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MonitorHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Protection_payboxRequestId_key" ON "Protection"("payboxRequestId");

-- CreateIndex
CREATE INDEX "Protection_ownerId_createdAt_idx" ON "Protection"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Protection_mode_status_idx" ON "Protection"("mode", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_protectionId_at_idx" ON "AuditEvent"("protectionId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_protectionId_dedupeKey_key" ON "AuditEvent"("protectionId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_protectionId_fkey" FOREIGN KEY ("protectionId") REFERENCES "Protection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one active protection per browser session.
CREATE UNIQUE INDEX "Protection_one_active_per_owner" ON "Protection"("ownerId") WHERE "status" IN ('ARMED', 'EXECUTING');

-- At most one active live protection at all: two live policies can never
-- both be entitled to sell from the operator's PayBox wallet.
CREATE UNIQUE INDEX "Protection_one_active_live" ON "Protection"("mode") WHERE "mode" = 'LIVE' AND "status" IN ('ARMED', 'EXECUTING');
