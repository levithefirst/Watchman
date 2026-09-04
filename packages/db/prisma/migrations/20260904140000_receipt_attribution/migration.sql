-- Receipt attribution: correct two misleading column names and add the two
-- figures that separate "how much loss did the hedge offset" from "what did
-- the hedge add".
--
--   netProtectionUsd -> grossLossOffsetUsd
--     Pure rename. The stored values are already min(loss, payout), which is
--     exactly the gross loss offset, so no backfill is needed.
--
--   efficiencyPct -> lossOffsetPct
--     Rename AND recompute. The old column held payout/premium, which could
--     read 800% on a position that still lost money. The new column holds
--     offset/loss, which is bounded at 100%. Existing rows are backfilled
--     from the primitives already stored on the row, so historical receipts
--     stay correct rather than silently changing meaning.
--
-- Guarded so a partially-migrated database converges instead of erroring.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Receipt' AND column_name = 'netProtectionUsd') THEN
    ALTER TABLE "Receipt" RENAME COLUMN "netProtectionUsd" TO "grossLossOffsetUsd";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Receipt' AND column_name = 'efficiencyPct') THEN
    ALTER TABLE "Receipt" RENAME COLUMN "efficiencyPct" TO "lossOffsetPct";
  END IF;
END $$;

ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "netHedgeContributionUsd" DECIMAL(30,10);
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "overshootUsd" DECIMAL(30,10);

-- Backfill every derived figure from the primitives on the row itself.
-- loss = GREATEST(0, -unhedgedPnlUsd); payout is already clamped at write time.
UPDATE "Receipt" SET
  "lossOffsetPct" = CASE
    WHEN GREATEST(0, -"unhedgedPnlUsd") > 0
      THEN LEAST(GREATEST(0, -"unhedgedPnlUsd"), "payoutUsd") / GREATEST(0, -"unhedgedPnlUsd") * 100
    ELSE 0
  END,
  "netHedgeContributionUsd" = COALESCE("netHedgeContributionUsd", "payoutUsd" - "premiumUsd"),
  "overshootUsd" = COALESCE("overshootUsd", GREATEST(0, "payoutUsd" - GREATEST(0, -"unhedgedPnlUsd")));

ALTER TABLE "Receipt" ALTER COLUMN "netHedgeContributionUsd" SET NOT NULL;
ALTER TABLE "Receipt" ALTER COLUMN "overshootUsd" SET NOT NULL;
