-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Asset" AS ENUM ('BTC', 'ETH');

-- CreateEnum
CREATE TYPE "HedgeStatus" AS ENUM ('QUOTED', 'OPEN', 'ACTIVE', 'SETTLING', 'SETTLED', 'REDEEMED', 'FAILED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exposure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" "Asset" NOT NULL,
    "amount" DECIMAL(30,10) NOT NULL,
    "entryPrice" DECIMAL(30,10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exposure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hedge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exposureId" TEXT,
    "asset" "Asset" NOT NULL,
    "marketId" TEXT NOT NULL,
    "marketSymbol" TEXT NOT NULL,
    "windowSeconds" INTEGER NOT NULL,
    "protectionPct" DECIMAL(8,5) NOT NULL,
    "exposureUsd" DECIMAL(30,10) NOT NULL,
    "protectedUsd" DECIMAL(30,10) NOT NULL,
    "contractsRequested" DECIMAL(30,10) NOT NULL,
    "contractsFilled" DECIMAL(30,10) NOT NULL,
    "premiumUsd" DECIMAL(30,10) NOT NULL,
    "downPrice" DECIMAL(20,10) NOT NULL,
    "txHash" TEXT,
    "expiry" TIMESTAMP(3) NOT NULL,
    "status" "HedgeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),

    CONSTRAINT "Hedge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "hedgeId" TEXT NOT NULL,
    "exposureUsd" DECIMAL(30,10) NOT NULL,
    "premiumUsd" DECIMAL(30,10) NOT NULL,
    "actualMovePct" DECIMAL(20,10) NOT NULL,
    "unhedgedPnlUsd" DECIMAL(30,10) NOT NULL,
    "hedgedPnlUsd" DECIMAL(30,10) NOT NULL,
    "payoutUsd" DECIMAL(30,10) NOT NULL,
    "netProtectionUsd" DECIMAL(30,10) NOT NULL,
    "efficiencyPct" DECIMAL(20,10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" "Asset" NOT NULL,
    "protectionPct" DECIMAL(8,5) NOT NULL,
    "windowSeconds" INTEGER NOT NULL,
    "maxPremiumUsd" DECIMAL(30,10) NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_wallet_key" ON "User"("wallet");

-- CreateIndex
CREATE INDEX "Exposure_userId_asset_idx" ON "Exposure"("userId", "asset");

-- CreateIndex
CREATE INDEX "Hedge_userId_status_idx" ON "Hedge"("userId", "status");

-- CreateIndex
CREATE INDEX "Hedge_marketId_idx" ON "Hedge"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_hedgeId_key" ON "Receipt"("hedgeId");

-- CreateIndex
CREATE INDEX "Policy_userId_status_idx" ON "Policy"("userId", "status");

-- AddForeignKey
ALTER TABLE "Exposure" ADD CONSTRAINT "Exposure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hedge" ADD CONSTRAINT "Hedge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hedge" ADD CONSTRAINT "Hedge_exposureId_fkey" FOREIGN KEY ("exposureId") REFERENCES "Exposure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_hedgeId_fkey" FOREIGN KEY ("hedgeId") REFERENCES "Hedge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

