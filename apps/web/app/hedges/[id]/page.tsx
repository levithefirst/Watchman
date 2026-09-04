"use client";

import { useEffect, useState } from "react";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import { Arrow, ButtonLink, Panel, Stat, StatusPill, Tag } from "../../components/ui";
import ErrorState from "../../components/ErrorState";
import { cents, count, money, protectionLabel, pct, shortDate, signedMoney } from "../../components/format";

interface Hedge { id: string; asset: string; marketId: string; marketSymbol: string; protectionPct: string; exposureUsd: string; protectedUsd: string; contractsRequested: string; contractsFilled: string; premiumUsd: string; downPrice: string; windowSeconds: number; expiry: string; status: string; txHash: string | null; redeemTxHash: string | null; createdAt: string; settledAt: string | null; redeemedAt: string | null; receipt: Receipt | null }
interface Receipt { id: string; actualMovePct: string; unhedgedPnlUsd: string; hedgedPnlUsd: string; payoutUsd: string; netProtectionUsd: string; efficiencyPct: string }

export default function HedgeDetailPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const [hedge, setHedge] = useState<Hedge>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void params.then(({ id }) =>
      fetch(`/api/hedges/${id}`)
        .then(async (response) => {
          const data = (await response.json()) as { hedge?: Hedge; error?: string };
          if (!response.ok) throw new Error(data.error);
          setHedge(data.hedge);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load hedge")),
    );
  }, [params]);

  if (error) {
    return (
      <>
        <SiteHeader variant="app" />
        <main id="main" className="min-h-screen bg-paper px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-lg">
            <ErrorState title="Couldn't load this hedge" detail={error}>
              <ButtonLink href="/hedges" tone="white">Back to hedges</ButtonLink>
            </ErrorState>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  if (!hedge) {
    return (
      <>
        <SiteHeader variant="app" />
        <main id="main" className="min-h-screen bg-paper px-5 py-14 sm:px-8" aria-busy="true">
          <span className="sr-only">Loading hedge…</span>
          <div className="mx-auto max-w-4xl">
            <div className="wm-skel h-4 w-28" />
            <div className="wm-skel mt-8 h-12 w-80 max-w-full" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="wm-skel h-28 rounded-2xl" />)}
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const receipt = hedge.receipt;

  return (
    <>
      <SiteHeader variant="app" />
      <main id="main" className="min-h-screen bg-paper">
        <section className="wm-rays-soft wm-grain relative overflow-hidden border-b-[3px] border-ink">
          <div className="relative mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tag tone="pink">{hedge.asset} protection</Tag>
              <StatusPill status={hedge.status} />
            </div>
            <h1 className="wm-display mt-7 text-[clamp(1.9rem,6vw,3.5rem)] break-words">
              {hedge.marketSymbol}
            </h1>
            <p className="mt-5 text-lg font-medium text-ink/80">
              {money(hedge.exposureUsd)} exposure · {protectionLabel(hedge.protectionPct)} target ·
              expires {shortDate(hedge.expiry)}
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
          <h2 className="wm-eyebrow text-ink-mute">Position</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Exposure" value={money(hedge.exposureUsd)} />
            <Stat
              label="Max payout"
              value={money(hedge.contractsFilled)}
              hint={`${count(hedge.contractsFilled)} contracts × $1.00`}
              tone="blue"
            />
            <Stat
              label="Premium paid"
              value={money(hedge.premiumUsd)}
              hint="Worst case — this is all you can lose on the hedge"
              tone="pink"
            />
            <Stat label="Down price" value={cents(hedge.downPrice)} />
            <Stat
              label="Filled"
              value={`${count(hedge.contractsFilled)} / ${count(hedge.contractsRequested)}`}
              hint="Contracts filled vs requested"
            />
            <Stat label="Expiry" value={shortDate(hedge.expiry)} />
          </div>

          {/* Proof — the verifiable on-chain trail, in one place. */}
          <section aria-labelledby="proof-title" className="mt-8">
            <div className="rounded-[22px] border-[3px] border-ink bg-white p-6 shadow-[6px_6px_0_0_#111] sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="proof-title" className="wm-eyebrow text-ink-mute">
                  Proof
                </h2>
                <span
                  className={`rounded-full border-[3px] border-ink px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${hedge.txHash ? "bg-mint" : "bg-blue"}`}
                >
                  {hedge.txHash ? "Executed on Somnia" : "Simulated — no on-chain order"}
                </span>
              </div>

              <dl className="mt-5 space-y-3.5">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-widest text-ink-mute">Market ID</dt>
                  <dd className="wm-numeral mt-1 break-all text-xs font-bold">{hedge.marketId}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-widest text-ink-mute">
                    Execution price
                  </dt>
                  <dd className="wm-numeral mt-1 text-sm font-bold">
                    {cents(hedge.downPrice)} · {count(hedge.contractsFilled)} filled
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-widest text-ink-mute">
                    Order transaction
                  </dt>
                  <dd className="mt-1 text-sm font-bold">
                    {hedge.txHash ? (
                      <a
                        className="wm-numeral break-all underline decoration-[3px] underline-offset-4"
                        href={`https://shannon-explorer.somnia.network/tx/${hedge.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {hedge.txHash} ↗
                      </a>
                    ) : (
                      <span className="text-ink-soft">
                        None — this hedge ran the full pipeline in simulation. Watchman does not
                        invent transaction hashes.
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-widest text-ink-mute">
                    Settlement
                  </dt>
                  <dd className="mt-1 text-sm font-bold">
                    {hedge.settledAt ? (
                      <>Resolved on-chain · {shortDate(hedge.settledAt)}</>
                    ) : (
                      <span className="text-ink-soft">Awaiting the market&apos;s resolution</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-widest text-ink-mute">
                    Redemption
                  </dt>
                  <dd className="mt-1 text-sm font-bold">
                    {hedge.redeemTxHash ? (
                      <a
                        className="wm-numeral break-all underline decoration-[3px] underline-offset-4"
                        href={`https://shannon-explorer.somnia.network/tx/${hedge.redeemTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {hedge.redeemTxHash} ↗
                      </a>
                    ) : (
                      <span className="text-ink-soft">
                        {hedge.settledAt
                          ? "Settled in simulation — nothing was redeemed on-chain"
                          : "Not yet due"}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {receipt ? (
            <section aria-labelledby="outcome-title" className="mt-12">
              <div className="rounded-[22px] border-[3px] border-ink bg-ink p-7 text-paper shadow-[6px_6px_0_0_#ff5fd0] sm:p-9">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="outcome-title" className="text-2xl font-bold tracking-tight">
                    What the hedge did
                  </h2>
                  <span className="rounded-full border-[3px] border-paper bg-mint px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-ink">
                    Settled
                  </span>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border-[3px] border-paper/25 p-5">
                    <p className="wm-eyebrow text-paper/50">Actual move</p>
                    <p className="wm-numeral mt-2 text-3xl font-bold">{pct(receipt.actualMovePct)}</p>
                  </div>
                  <div className="rounded-2xl border-[3px] border-paper/25 p-5">
                    <p className="wm-eyebrow text-paper/50">Hedge payout</p>
                    <p className="wm-numeral mt-2 text-3xl font-bold">{money(receipt.payoutUsd)}</p>
                  </div>
                  <div className="rounded-2xl border-[3px] border-paper/25 p-5">
                    <p className="wm-eyebrow text-paper/50">Unhedged P&amp;L</p>
                    <p className="wm-numeral mt-2 text-3xl font-bold">{signedMoney(receipt.unhedgedPnlUsd)}</p>
                  </div>
                  <div className="rounded-2xl border-[3px] border-paper/25 p-5">
                    <p className="wm-eyebrow text-paper/50">Hedged P&amp;L</p>
                    <p className="wm-numeral mt-2 text-3xl font-bold">{signedMoney(receipt.hedgedPnlUsd)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border-[3px] border-ink bg-yellow p-6 text-ink">
                  <p className="wm-eyebrow text-ink/70">Net protection</p>
                  <p className="wm-numeral mt-2 text-4xl font-bold sm:text-5xl">{money(receipt.netProtectionUsd)}</p>
                  <p className="mt-2 text-sm font-bold">Efficiency {pct(receipt.efficiencyPct)}</p>
                </div>

                <div className="mt-7">
                  <ButtonLink href={`/receipt/${receipt.id}`} tone="yellow" size="lg" className="group">
                    Open full receipt <Arrow />
                  </ButtonLink>
                </div>
              </div>
            </section>
          ) : (
            <section aria-labelledby="pending-title" className="mt-12">
              <Panel className="p-8 sm:p-10">
                <h2 id="pending-title" className="text-2xl font-bold tracking-tight">
                  Waiting for settlement
                </h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-ink-soft">
                  The settlement agent is tracking this market on-chain. Once the contract&apos;s
                  window closes it redeems the winning side and writes the receipt — refresh this
                  page then.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <ButtonLink href="/hedges" tone="white">All hedges</ButtonLink>
                  <ButtonLink href="/protect" tone="yellow" className="group">
                    Protect another <Arrow />
                  </ButtonLink>
                </div>
              </Panel>
            </section>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
