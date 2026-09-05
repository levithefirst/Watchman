"use client";

import { useEffect, useState } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { Arrow, ButtonLink, Tag } from "../../components/ui";
import ErrorState from "../../components/ErrorState";
import { track } from "../../components/analytics";
import { money, num, pct, signedMoney } from "../../components/format";

interface Receipt { id: string; hedgeId: string; exposureUsd: string; premiumUsd: string; actualMovePct: string; unhedgedPnlUsd: string; hedgedPnlUsd: string; payoutUsd: string; grossLossOffsetUsd: string; lossOffsetPct: string; netHedgeContributionUsd: string; overshootUsd: string; createdAt: string; demo?: boolean }

function summarize(receipt: Receipt): string {
  const move = num(receipt.actualMovePct);
  const payout = num(receipt.payoutUsd);
  const premium = num(receipt.premiumUsd);
  const loss = Math.max(0, -num(receipt.unhedgedPnlUsd));
  const direction = move < 0 ? "fell" : move > 0 ? "rose" : "was flat";
  const opening = `The underlying ${direction} ${Math.abs(move).toFixed(2)}% over the demo window, a ${money(loss)} loss on the position.`;

  if (payout <= 0) return `${opening} The Down contract did not resolve in your favour, so it paid nothing and the hedge cost you its ${money(premium)} premium.`;
  const gap = payout - loss;
  const shape = Math.abs(gap) < 0.01 ? "almost exactly matching that loss" : gap > 0 ? `overshooting that loss by ${money(gap)}` : `covering ${money(payout)} of it and leaving ${money(-gap)} uncovered`;
  return `${opening} The Down contract is modelled as resolving true and paying its full face value of ${money(payout)}, ${shape}. A binary pays all or nothing, so the difference is the basis.`;
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const [receipt, setReceipt] = useState<Receipt>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void params.then(({ id }) => fetch(`/api/receipt/${id}`).then(async (response) => {
      const data = (await response.json()) as { receipt?: Receipt; error?: string };
      if (!response.ok) throw new Error(data.error);
      setReceipt(data.receipt);
      if (data.receipt) track("hedge_receipt_viewed", { receiptId: data.receipt.id, hedgeId: data.receipt.hedgeId });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load receipt")));
  }, [params]);

  if (error) return <><SiteHeader variant="app" /><main id="main" className="min-h-screen bg-paper px-5 py-16 sm:px-8"><div className="mx-auto max-w-lg"><ErrorState title="Couldn't load this receipt" detail={error}><ButtonLink href="/hedges" tone="white">Back to hedges</ButtonLink></ErrorState></div></main><SiteFooter /></>;
  if (!receipt) return <><SiteHeader variant="app" /><main id="main" className="min-h-screen bg-paper px-5 py-14 sm:px-8" aria-busy="true"><span className="sr-only">Loading receipt…</span><div className="mx-auto max-w-3xl rounded-[22px] border-[3px] border-ink bg-white p-8 sm:p-10"><div className="wm-skel h-4 w-44" /><div className="wm-skel mt-4 h-12 w-72 max-w-full" /><div className="mt-9 grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="wm-skel h-24 rounded-2xl" />)}</div><div className="wm-skel mt-6 h-32 rounded-2xl" /></div></main><SiteFooter /></>;

  const overshoot = num(receipt.overshootUsd);
  const netContribution = num(receipt.netHedgeContributionUsd);
  const isDemo = receipt.demo === true;

  return (
    <>
      <SiteHeader variant="app" />
      <main id="main" className="min-h-screen bg-paper">
        <section className="wm-rays wm-grain relative overflow-hidden border-b-[3px] border-ink" style={{ ["--ry" as string]: "45%" }}>
          <div className="relative mx-auto max-w-3xl px-5 py-12 text-center sm:px-8 sm:py-16"><div className="flex justify-center"><Tag tone="pink">Hedge receipt</Tag></div><h1 className="wm-display mt-7 text-[clamp(2.25rem,7vw,4.25rem)]">NO HIDDEN OUTCOME.</h1></div>
        </section>

        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
          <article className="rounded-[22px] border-[3px] border-ink bg-white p-6 shadow-[10px_10px_0_0_#ff5fd0] sm:p-10">
            <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xl font-bold tracking-tight">WATCHMAN</p><p className="wm-eyebrow mt-1 text-ink-mute">Hedge receipt</p></div><div className="text-right"><span className="rounded-full border-[3px] border-ink bg-blue px-3 py-1 text-[11px] font-bold uppercase tracking-widest">{isDemo ? "Demo scenario" : "Settled"}</span><p className="wm-numeral mt-2 text-xs font-bold text-ink-mute">{new Date(receipt.createdAt).toLocaleDateString()}</p></div></header>
            <div className="wm-dotline my-7" />
            {isDemo ? <div className="mb-7 rounded-2xl border-[3px] border-ink bg-yellow p-5"><p className="wm-eyebrow text-ink/70">Demo only</p><p className="mt-2 text-sm font-bold leading-6">This receipt uses a -3.00% scenario and the real live quote and fillable amount from the demo hedge. No on-chain order or settlement is claimed.</p></div> : null}

            <div className="rounded-2xl border-[3px] border-ink bg-blue-pale p-5 sm:p-6"><p className="wm-eyebrow text-ink/70">What the hedge actually did</p><p className="mt-2.5 text-base font-medium leading-7 sm:text-lg sm:leading-8">{summarize(receipt)}</p></div>
            <div className="wm-dotline my-7" />

            <dl className="grid grid-cols-2 gap-x-6 gap-y-7 sm:gap-x-10">
              <div><dt className="wm-eyebrow text-ink-mute">What I had</dt><dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{money(receipt.exposureUsd)}</dd><dd className="mt-1 text-xs font-medium text-ink-soft">Exposure</dd></div>
              <div><dt className="wm-eyebrow text-ink-mute">What I paid</dt><dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{money(receipt.premiumUsd)}</dd><dd className="mt-1 text-xs font-medium text-ink-soft">Premium</dd></div>
              <div><dt className="wm-eyebrow text-ink-mute">What happened</dt><dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{pct(receipt.actualMovePct)}</dd><dd className="mt-1 text-xs font-medium text-ink-soft">{isDemo ? "Demo market move" : "Market move"}</dd></div>
              <div><dt className="wm-eyebrow text-ink-mute">What the hedge returned</dt><dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{money(receipt.payoutUsd)}</dd><dd className="mt-1 text-xs font-medium text-ink-soft">Hedge payout</dd></div>
              <div><dt className="wm-eyebrow text-ink-mute">Without the hedge</dt><dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{signedMoney(receipt.unhedgedPnlUsd)}</dd><dd className="mt-1 text-xs font-medium text-ink-soft">Unhedged P&amp;L</dd></div>
              <div><dt className="wm-eyebrow text-ink-mute">What remained</dt><dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{signedMoney(receipt.hedgedPnlUsd)}</dd><dd className="mt-1 text-xs font-medium text-ink-soft">Hedged P&amp;L</dd></div>
            </dl>

            <div className="wm-dotline my-7" />
            <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border-[3px] border-ink bg-ink p-6 text-paper"><p className="wm-eyebrow text-paper/50">Loss offset</p><p className="wm-numeral mt-2 text-4xl font-bold">{pct(receipt.lossOffsetPct)}</p><p className="mt-2 text-sm font-bold text-paper/70">{money(receipt.grossLossOffsetUsd)} of the loss covered</p></div><div className="rounded-2xl border-[3px] border-ink bg-yellow p-6"><p className="wm-eyebrow text-ink/70">Net hedge contribution</p><p className="wm-numeral mt-2 text-4xl font-bold">{signedMoney(netContribution)}</p><p className="mt-2 text-sm font-medium leading-6">Payout minus the premium you paid.</p></div></div>
            {overshoot > 0 ? <div className="mt-4 rounded-2xl border-[3px] border-ink bg-blue-pale p-6"><p className="wm-eyebrow text-ink/70">Overshoot</p><p className="wm-numeral mt-2 text-3xl font-bold">{money(overshoot)}</p><p className="mt-2 text-sm font-medium leading-6">The contract paid {money(overshoot)} more than the loss it was bought to cover. That surplus is basis, not extra protection: a binary settles at its full face value or nothing.</p></div> : null}
            <p className="mt-8 text-xs leading-6 text-ink-mute">Loss offset is the share of the realised loss the payout covered, so it cannot exceed 100%. Net hedge contribution is payout minus premium. A binary Down Event Contract is defined by its event window and settlement rule and does not replicate a put. {isDemo ? "This demo receipt is a computed scenario, not a live settlement." : "Every live figure here reflects the contract's actual settlement."}</p>
          </article>
          <div className="mt-8 flex flex-wrap gap-3"><ButtonLink href={`/hedges/${receipt.hedgeId}`} tone="white">View hedge</ButtonLink><ButtonLink href="/protect" tone="yellow" className="group">Protect another position <Arrow /></ButtonLink></div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
