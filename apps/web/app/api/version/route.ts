import { NextResponse } from "next/server";
import { BUILT_AT, COMMIT_SHA_FULL, DEPLOY_ENV } from "../../components/build-info";
import { SHOWCASE_DOWN_PRICE, SHOWCASE_INPUT, SHOWCASE_QUOTE } from "../../components/scenario";

/**
 * Machine-readable deployment identity, so "is the fix actually live?" can be
 * answered with one curl instead of dashboard access:
 *
 *   curl https://<host>/api/version
 *
 * It also echoes the homepage showcase figures straight from the hedge engine,
 * which makes it impossible for the marketing page to drift back into showing
 * numbers the engine would never produce without this endpoint disagreeing.
 *
 * The `derivation` and `checks` blocks exist because the corrected scenario and
 * the old impossible one share three of their four figures (38¢ / 5,000
 * contracts / $5,000 max payout) and differ only in premium: $1,900 (correct,
 * 5,000 × 0.38) versus $150 (impossible, implies a 3¢ price). Publishing the
 * arithmetic means nobody has to do that multiplication in their head to tell
 * the two apart.
 */
export function GET(): NextResponse {
  const downPrice = SHOWCASE_DOWN_PRICE;
  const contracts = SHOWCASE_QUOTE.contractsToBuy;
  const premiumUsd = Number(SHOWCASE_QUOTE.premiumUsd.toFixed(2));
  const maxPayoutUsd = SHOWCASE_QUOTE.potentialPayoutUsd;

  // Recomputed here from first principles, independently of the engine's own
  // arithmetic, so a mismatch surfaces instead of being echoed back.
  const checks = {
    premiumEqualsContractsTimesPrice:
      Math.abs(premiumUsd - contracts * downPrice) < 0.005,
    maxPayoutEqualsContractsAtFaceValue: maxPayoutUsd === contracts,
    premiumBelowMaxPayout: premiumUsd < maxPayoutUsd,
    withinPremiumBudget: premiumUsd <= SHOWCASE_INPUT.maxPremiumUsd,
  };

  return NextResponse.json({
    commit: COMMIT_SHA_FULL,
    environment: DEPLOY_ENV,
    builtAt: BUILT_AT,
    // Engine-derived, not hand-written constants. These are the same values
    // the homepage renders; both import apps/web/app/components/scenario.ts.
    showcase: {
      source: "apps/web/app/components/scenario.ts → @watchman/sdk quoteHedge()",
      mirrors: "the homepage hero quote and receipt panel",
      input: {
        exposureUsd: SHOWCASE_INPUT.exposureUsd,
        protectionPct: SHOWCASE_INPUT.protectionPct,
        maxPremiumUsd: SHOWCASE_INPUT.maxPremiumUsd,
        windowSeconds: SHOWCASE_INPUT.windowSeconds,
      },
      downPrice,
      contracts,
      premiumUsd,
      maxPayoutUsd,
      fullyFunded: SHOWCASE_QUOTE.fullyFunded,
      derivation: {
        contracts: `ceil(${SHOWCASE_INPUT.exposureUsd} × ${SHOWCASE_INPUT.protectionPct}) = ${contracts} contracts`,
        premiumUsd: `${contracts} × ${downPrice} = ${premiumUsd}`,
        maxPayoutUsd: `${contracts} × $1.00 face value = ${maxPayoutUsd}`,
      },
      checks,
      consistent: Object.values(checks).every(Boolean),
    },
  });
}
