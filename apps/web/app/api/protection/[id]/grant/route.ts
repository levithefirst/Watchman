import { armProtection, DEMO_BALANCE_WEI, DEMO_CREDENTIAL, maxSellFor } from "@watchman/core";
import { BaseRpc, createPayboxClient, payboxEnv, pickWallet, swapOperation } from "@watchman/core/live";
import { isUniqueViolation } from "@watchman/db";
import { json, livePrice, owned, problem, resolveMode, store, viewOf } from "../../../../lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEMO_FALLBACK_REFERENCE_CENTS = 4_000_00;

/**
 * Grant → arm. Watchman first confirms with PayBox that it actually holds a
 * grant on a Base wallet, then captures the reference price and balance and
 * freezes the policy. If any of that can't be confirmed, nothing is armed.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const found = await owned((await params).id);
  if (found instanceof Response) return found;
  const { p } = found;
  if (p.status !== "DRAFT") return problem(409, "not_draft", "This protection is already armed. Revoke it and create a new one to change anything.");

  const arm = async (input: Parameters<typeof armProtection>[2]) => {
    try {
      const result = await armProtection(store, p, input);
      if (!result.ok) return problem(409, result.code, result.message);
      return json({ view: await viewOf(result.protection) });
    } catch (error) {
      if (isUniqueViolation(error)) return problem(409, "active_exists", "Another protection is already active. Only one can run at a time.");
      throw error;
    }
  };

  if (p.mode === "DEMO") {
    const observation = await livePrice();
    return arm({
      referencePriceCents: observation?.priceCents ?? DEMO_FALLBACK_REFERENCE_CENTS,
      referenceSources: observation ? `${observation.quotes.map((q) => q.source).join(" + ")}, then simulated` : "Simulated market",
      balanceWei: DEMO_BALANCE_WEI,
      credentialId: DEMO_CREDENTIAL.id,
      credentialName: DEMO_CREDENTIAL.name,
      approvalMode: DEMO_CREDENTIAL.approvalMode,
      walletAddress: null,
      now: new Date(),
    });
  }

  const { operator } = await resolveMode();
  if (!operator) return problem(403, "operator_required", "Live protections can only be armed from an operator session.");

  const paybox = createPayboxClient(payboxEnv());
  let list;
  try {
    list = await paybox.listCredentials();
  } catch {
    return problem(502, "paybox_unreachable", "Watchman couldn't reach PayBox to confirm its permission. Nothing was armed.");
  }

  const pick = pickWallet(list);
  if (pick.kind === "not_granted") {
    const change = await paybox
      .requestAccountChange("Watchman needs access to one Base wallet. It may only sell ETH for USDC, within the limit you set, when your price trigger is hit.")
      .catch(() => null);
    const message = pick.ungrantedWallets.length
      ? `Watchman doesn't have access to ${pick.ungrantedWallets[0]} yet. Grant it in PayBox, then check again.`
      : "Watchman doesn't have access to a wallet yet. Grant one in PayBox, then check again.";
    return json({ error: { code: "grant_required", message, manageUrl: change?.manage_url ?? "https://app.paybox.sh" } }, 409);
  }
  if (pick.kind === "no_evm_address") {
    return problem(409, "no_base_wallet", `PayBox granted ${pick.name}, but it has no Base address Watchman can protect. Grant an EVM wallet instead.`);
  }

  const { wallet } = pick;
  let balanceWei: bigint;
  try {
    balanceWei = await new BaseRpc().balanceWei(wallet.address);
  } catch {
    return problem(502, "balance_unavailable", "Watchman couldn't read this wallet's ETH balance on Base. Nothing was armed.");
  }
  const maxSell = maxSellFor(balanceWei, p.sellBps);

  const readiness = await paybox.checkOperationReadiness({ operation: swapOperation(wallet.credentialId, maxSell) }).catch(() => null);
  if (readiness && !readiness.can_attempt) {
    const blocker = readiness.blockers[0];
    return problem(409, "paybox_not_ready", `PayBox says this swap can't run yet${blocker ? `: ${blocker.message}` : "."} Nothing was armed.`);
  }

  const observation = await livePrice();
  if (!observation) return problem(503, "price_unavailable", "Watchman couldn't read a fresh ETH price to set your reference. Nothing was armed.");
  if (observation.spreadBps > 150) return problem(503, "price_disagreement", "Coinbase and Kraken disagree on the ETH price right now, so Watchman won't set a reference. Try again in a moment.");

  return arm({
    referencePriceCents: observation.priceCents,
    referenceSources: observation.quotes.map((q) => q.source).join(" + "),
    balanceWei,
    credentialId: wallet.credentialId,
    credentialName: wallet.name,
    approvalMode: wallet.approvalMode,
    walletAddress: wallet.address,
    now: new Date(),
  });
}
