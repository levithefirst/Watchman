import { NextResponse } from "next/server";
import { BUILT_AT, COMMIT_SHA_FULL, DEPLOY_ENV } from "../../components/build-info";
import { SHOWCASE_DOWN_PRICE, SHOWCASE_QUOTE } from "../../components/scenario";

/**
 * Machine-readable deployment identity, so "is the fix actually live?" can be
 * answered with one curl instead of dashboard access:
 *
 *   curl https://<host>/api/version
 *
 * It also echoes the homepage showcase figures straight from the hedge engine,
 * which makes it impossible for the marketing page to drift back into showing
 * numbers the engine would never produce without this endpoint disagreeing.
 */
export function GET(): NextResponse {
  return NextResponse.json({
    commit: COMMIT_SHA_FULL,
    environment: DEPLOY_ENV,
    builtAt: BUILT_AT,
    // Engine-derived — not hand-written constants.
    showcase: {
      downPrice: SHOWCASE_DOWN_PRICE,
      contracts: SHOWCASE_QUOTE.contractsToBuy,
      premiumUsd: Number(SHOWCASE_QUOTE.premiumUsd.toFixed(2)),
      maxPayoutUsd: SHOWCASE_QUOTE.potentialPayoutUsd,
      fullyFunded: SHOWCASE_QUOTE.fullyFunded,
    },
  });
}
