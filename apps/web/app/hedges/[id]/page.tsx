"use client";

import { useEffect, useState } from "react";

interface Hedge { id: string; asset: string; marketSymbol: string; protectionPct: string; exposureUsd: string; protectedUsd: string; contractsFilled: string; premiumUsd: string; downPrice: string; expiry: string; status: string; txHash: string | null; receipt: Receipt | null }
interface Receipt { id: string; actualMovePct: string; unhedgedPnlUsd: string; hedgedPnlUsd: string; payoutUsd: string; netProtectionUsd: string; efficiencyPct: string }

export default function HedgeDetailPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const [hedge, setHedge] = useState<Hedge>();
  const [error, setError] = useState<string>();
  useEffect(() => { void params.then(({ id }) => fetch(`/api/hedges/${id}`).then(async (response) => { const data = (await response.json()) as { hedge?: Hedge; error?: string }; if (!response.ok) throw new Error(data.error); setHedge(data.hedge); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load hedge"))); }, [params]);
  if (error) return <main className="min-h-screen bg-black px-5 py-10 text-zinc-100"><div className="mx-auto max-w-lg rounded-2xl border border-red-900 bg-red-950/20 p-6 text-sm text-red-300">{error}</div></main>;
  if (!hedge) return (
    <main className="min-h-screen bg-black px-5 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl animate-pulse">
        <div className="h-3 w-24 rounded bg-zinc-900" />
        <div className="mt-12 h-10 w-72 rounded bg-zinc-900" />
        <div className="mt-10 grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-zinc-900" />)}</div>
      </div>
    </main>
  );
  return <main className="min-h-screen bg-black px-5 py-10 text-zinc-100"><div className="mx-auto max-w-4xl"><a href="/hedges" className="text-sm text-zinc-500">← All hedges</a><div className="mt-12 flex items-start justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.25em] text-zinc-500">{hedge.asset} protection</p><h1 className="mt-2 text-4xl font-semibold">{hedge.marketSymbol}</h1></div><span className="rounded-full bg-zinc-900 px-3 py-1 text-xs">{hedge.status}</span></div><div className="mt-10 grid gap-3 sm:grid-cols-2"><Metric label="Exposure" value={`$${hedge.exposureUsd}`} /><Metric label="Protected" value={`$${hedge.protectedUsd}`} /><Metric label="Contracts" value={hedge.contractsFilled} /><Metric label="Premium" value={`$${hedge.premiumUsd}`} /><Metric label="Down price" value={`${(Number(hedge.downPrice) * 100).toFixed(2)}¢`} /><Metric label="Expiry" value={new Date(hedge.expiry).toLocaleString()} /></div>{hedge.receipt && <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-7"><p className="text-sm text-zinc-500">Hedge Receipt</p><div className="mt-6 grid gap-5 sm:grid-cols-2"><Metric label="Actual move" value={`${hedge.receipt.actualMovePct}%`} /><Metric label="Hedge payout" value={`$${hedge.receipt.payoutUsd}`} /><Metric label="Unhedged P&L" value={`$${hedge.receipt.unhedgedPnlUsd}`} /><Metric label="Hedged P&L" value={`$${hedge.receipt.hedgedPnlUsd}`} /><Metric label="Net protection" value={`$${hedge.receipt.netProtectionUsd}`} /><Metric label="Efficiency" value={`${hedge.receipt.efficiencyPct}%`} /></div><a href={`/receipt/${hedge.receipt.id}`} className="mt-7 inline-block rounded-xl bg-white px-5 py-3 text-sm font-medium text-black">Open permanent receipt</a></div>}</div></main>;
}
function Metric({ label, value }: { label: string; value: string }): React.ReactElement { return <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-lg font-medium">{value}</p></div>; }
