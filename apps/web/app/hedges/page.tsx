"use client";

import { useEffect, useState } from "react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { Arrow, ButtonLink, Panel, StatusPill, Tag } from "../components/ui";
import ErrorState from "../components/ErrorState";
import { track } from "../components/analytics";
import { money, protectionLabel, shortDate, untilLabel } from "../components/format";

interface HedgeRow { id: string; asset: string; marketSymbol: string; protectionPct: string; exposureUsd: string; contractsFilled: string; premiumUsd: string; expiry: string; status: string; txHash: string | null; receipt: { id: string } | null }

export default function HedgesPage(): React.ReactElement {
  const [wallet, setWallet] = useState("demo");
  const [hedges, setHedges] = useState<HedgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const stored = window.localStorage.getItem("watchman.wallet");
    if (stored) setWallet(stored);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(undefined);
    void fetch(`/api/hedges?wallet=${encodeURIComponent(wallet)}`)
      .then(async (response) => {
        const data = (await response.json()) as { hedges?: HedgeRow[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load hedges");
        setHedges(data.hedges ?? []);
        track("hedge_list_viewed", { count: data.hedges?.length ?? 0, wallet: wallet === "demo" ? "demo" : "wallet" });
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load hedges"))
      .finally(() => setLoading(false));
  }, [wallet]);

  return (
    <>
      <SiteHeader variant="app" />
      <main id="main" className="min-h-screen bg-paper">
        <section className="wm-rays-soft wm-grain relative overflow-hidden border-b-[3px] border-ink">
          <div className="relative mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tag tone="pink">Your hedges</Tag>
              <Tag tone="white">{wallet === "demo" ? "Demo account" : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`}</Tag>
            </div>
            <h1 className="wm-display mt-7 text-[clamp(2.25rem,7vw,4.25rem)]">
              EVERY POSITION WATCHMAN IS WATCHING.
            </h1>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          {loading ? (
            <div className="space-y-4" aria-busy="true" aria-live="polite">
              <span className="sr-only">Loading hedges…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-[22px] border-[3px] border-ink bg-white p-6">
                  <div className="wm-skel h-6 w-56" />
                  <div className="wm-skel mt-3 h-4 w-72" />
                  <div className="wm-skel mt-6 h-4 w-40" />
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState title="Couldn't load your hedges" detail={error}>
              <ButtonLink href="/protect" tone="yellow" className="group">
                Protect a position <Arrow />
              </ButtonLink>
            </ErrorState>
          ) : hedges.length === 0 ? (
            <Panel className="p-10 text-center sm:p-14">
              <p className="wm-numeral text-6xl font-bold text-blue">00</p>
              <h2 className="mt-5 text-2xl font-bold">No hedges yet</h2>
              <p className="mx-auto mt-3 max-w-md text-base leading-7 text-ink-soft">
                Protect a position and it appears here, tracked until the contract settles and a
                receipt is written.
              </p>
              <div className="mt-8 flex justify-center">
                <ButtonLink href="/protect" tone="yellow" size="lg" className="group">
                  Protect a position <Arrow />
                </ButtonLink>
              </div>
            </Panel>
          ) : (
            <ul className="space-y-4">
              {hedges.map((hedge) => (
                <li key={hedge.id}>
                  <a
                    href={`/hedges/${hedge.id}`}
                    className="wm-lift block rounded-[22px] border-[3px] border-ink bg-white p-6 no-underline shadow-[6px_6px_0_0_#111] sm:p-7"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-bold tracking-tight">
                          {hedge.asset} · {protectionLabel(hedge.protectionPct)} target hedge
                        </p>
                        <p className="mt-1.5 text-sm font-medium text-ink-soft">{hedge.marketSymbol}</p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {hedge.receipt ? (
                          <span className="rounded-full border-[3px] border-ink bg-yellow px-3 py-1 text-[11px] font-bold uppercase tracking-widest">
                            Receipt ready
                          </span>
                        ) : null}
                        <StatusPill status={hedge.status} />
                      </div>
                    </div>

                    <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <dt className="wm-eyebrow text-ink-mute">Exposure</dt>
                        <dd className="wm-numeral mt-1.5 text-lg font-bold">{money(hedge.exposureUsd)}</dd>
                      </div>
                      <div>
                        <dt className="wm-eyebrow text-ink-mute">Premium</dt>
                        <dd className="wm-numeral mt-1.5 text-lg font-bold">{money(hedge.premiumUsd)}</dd>
                      </div>
                      <div>
                        <dt className="wm-eyebrow text-ink-mute">Max payout</dt>
                        <dd className="wm-numeral mt-1.5 text-lg font-bold">{money(hedge.contractsFilled)}</dd>
                      </div>
                      <div>
                        <dt className="wm-eyebrow text-ink-mute">Window</dt>
                        <dd className="wm-numeral mt-1.5 text-lg font-bold">{untilLabel(hedge.expiry)}</dd>
                      </div>
                    </dl>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
