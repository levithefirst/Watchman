"use client";

import { useEffect, useState } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { Arrow, ButtonLink, Tag } from "../../components/ui";
import ErrorState from "../../components/ErrorState";
import { track } from "../../components/analytics";
import { money, num, pct, signedMoney } from "../../components/format";

interface Receipt { id: string; hedgeId: string; exposureUsd: string; premiumUsd: string; actualMovePct: string; unhedgedPnlUsd: string; hedgedPnlUsd: string; payoutUsd: string; netProtectionUsd: string; efficiencyPct: string; createdAt: string }

/** Plain-English summary of the settled outcome, built from the real values. */
function summarize(receipt: Receipt): string {
  const move = num(receipt.actualMovePct);
  const payout = num(receipt.payoutUsd);
  const netProtection = num(receipt.netProtectionUsd);
  const direction = move < 0 ? "dropped" : move > 0 ? "rose" : "was flat";
  const payoutClause =
    payout > 0
      ? `the hedge paid out ${money(receipt.payoutUsd)}, offsetting ${netProtection >= 0 ? "" : "part of "}the loss by ${money(receipt.netProtectionUsd)} net of premium`
      : `the hedge paid out $0 — the event resolved in the position's favour, so the only cost was the ${money(receipt.premiumUsd)} premium`;
  return `The underlying ${direction} ${Math.abs(move).toFixed(2)}% over the protection window. As a result, ${payoutClause}.`;
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const [receipt, setReceipt] = useState<Receipt>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void params.then(({ id }) =>
      fetch(`/api/receipt/${id}`)
        .then(async (response) => {
          const data = (await response.json()) as { receipt?: Receipt; error?: string };
          if (!response.ok) throw new Error(data.error);
          setReceipt(data.receipt);
          if (data.receipt) track("hedge_receipt_viewed", { receiptId: data.receipt.id, hedgeId: data.receipt.hedgeId });
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load receipt")),
    );
  }, [params]);

  if (error) {
    return (
      <>
        <SiteHeader variant="app" />
        <main id="main" className="min-h-screen bg-paper px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-lg">
            <ErrorState title="Couldn't load this receipt" detail={error}>
              <ButtonLink href="/hedges" tone="white">Back to hedges</ButtonLink>
            </ErrorState>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  if (!receipt) {
    return (
      <>
        <SiteHeader variant="app" />
        <main id="main" className="min-h-screen bg-paper px-5 py-14 sm:px-8" aria-busy="true">
          <span className="sr-only">Loading receipt…</span>
          <div className="mx-auto max-w-3xl rounded-[22px] border-[3px] border-ink bg-white p-8 sm:p-10">
            <div className="wm-skel h-4 w-44" />
            <div className="wm-skel mt-4 h-12 w-72 max-w-full" />
            <div className="mt-9 grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="wm-skel h-24 rounded-2xl" />)}
            </div>
            <div className="wm-skel mt-6 h-32 rounded-2xl" />
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  // Basis difference: what the binary contract actually paid, versus the loss it was covering.
  const downsideLoss = Math.max(0, -num(receipt.unhedgedPnlUsd));
  const basisDifference = num(receipt.payoutUsd) - downsideLoss;

  return (
    <>
      <SiteHeader variant="app" />
      <main id="main" className="min-h-screen bg-paper">
        <section className="wm-rays wm-grain relative overflow-hidden border-b-[3px] border-ink" style={{ ["--ry" as string]: "45%" }}>
          <div className="relative mx-auto max-w-3xl px-5 py-12 text-center sm:px-8 sm:py-16">
            <div className="flex justify-center"><Tag tone="pink">Hedge receipt</Tag></div>
            <h1 className="wm-display mt-7 text-[clamp(2.25rem,7vw,4.25rem)]">NO HIDDEN OUTCOME.</h1>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
          <article className="rounded-[22px] border-[3px] border-ink bg-white p-6 shadow-[10px_10px_0_0_#ff5fd0] sm:p-10">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xl font-bold tracking-tight">WATCHMAN</p>
                <p className="wm-eyebrow mt-1 text-ink-mute">Hedge receipt</p>
              </div>
              <div className="text-right">
                <span className="rounded-full border-[3px] border-ink bg-mint px-3 py-1 text-[11px] font-bold uppercase tracking-widest">
                  Settled
                </span>
                <p className="wm-numeral mt-2 text-xs font-bold text-ink-mute">
                  {new Date(receipt.createdAt).toLocaleDateString()}
                </p>
              </div>
            </header>

            <div className="wm-dotline my-7" />

            <div className="rounded-2xl border-[3px] border-ink bg-blue-pale p-5 sm:p-6">
              <p className="wm-eyebrow text-ink/70">What the hedge actually did</p>
              <p className="mt-2.5 text-base font-medium leading-7 sm:text-lg sm:leading-8">
                {summarize(receipt)}
              </p>
            </div>

            <div className="wm-dotline my-7" />

            <dl className="grid grid-cols-2 gap-x-6 gap-y-7 sm:gap-x-10">
              <div>
                <dt className="wm-eyebrow text-ink-mute">Exposure</dt>
                <dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{money(receipt.exposureUsd)}</dd>
              </div>
              <div>
                <dt className="wm-eyebrow text-ink-mute">Premium</dt>
                <dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{money(receipt.premiumUsd)}</dd>
              </div>
              <div>
                <dt className="wm-eyebrow text-ink-mute">Actual move</dt>
                <dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{pct(receipt.actualMovePct)}</dd>
              </div>
              <div>
                <dt className="wm-eyebrow text-ink-mute">Payout</dt>
                <dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{money(receipt.payoutUsd)}</dd>
              </div>
              <div>
                <dt className="wm-eyebrow text-ink-mute">Unhedged P&amp;L</dt>
                <dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{signedMoney(receipt.unhedgedPnlUsd)}</dd>
              </div>
              <div>
                <dt className="wm-eyebrow text-ink-mute">Hedged P&amp;L</dt>
                <dd className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{signedMoney(receipt.hedgedPnlUsd)}</dd>
              </div>
            </dl>

            <div className="wm-dotline my-7" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border-[3px] border-ink bg-ink p-6 text-paper">
                <p className="wm-eyebrow text-paper/50">Net protection</p>
                <p className="wm-numeral mt-2 text-4xl font-bold">{money(receipt.netProtectionUsd)}</p>
                <p className="mt-2 text-sm font-bold text-paper/70">Efficiency {pct(receipt.efficiencyPct)}</p>
              </div>
              <div className="rounded-2xl border-[3px] border-ink bg-yellow p-6">
                <p className="wm-eyebrow text-ink/70">Basis difference</p>
                <p className="wm-numeral mt-2 text-4xl font-bold">{signedMoney(basisDifference)}</p>
                <p className="mt-2 text-sm font-medium leading-6">
                  Payout minus the loss it was covering.
                </p>
              </div>
            </div>

            <p className="mt-8 text-xs leading-6 text-ink-mute">
              A binary Down Event Contract is defined by its event window and settlement rule, and
              does not replicate a perfect put. The figures above reflect the contract&apos;s actual
              settlement, not a modelled hedge.
            </p>
          </article>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={`/hedges/${receipt.hedgeId}`} tone="white">View hedge</ButtonLink>
            <ButtonLink href="/protect" tone="yellow" className="group">
              Protect another position <Arrow />
            </ButtonLink>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
