-- The settlement agent already redeems the winning side on-chain, but the
-- transaction hash it gets back was discarded, so the redemption half of the
-- proof trail could never be shown. Additive and nullable: existing rows keep
-- NULL and simply render as "not redeemed on-chain".
ALTER TABLE "Hedge" ADD COLUMN IF NOT EXISTS "redeemTxHash" TEXT;
