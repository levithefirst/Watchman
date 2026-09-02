"use client";

import { useEffect, useState } from "react";

interface HedgeRow { id: string; asset: string; marketSymbol: string; protectionPct: string; exposureUsd: string; premiumUsd: string; expiry: string; status: string; txHash: string | null; receipt: { id: string } | null }

export default function HedgesPage(): React.ReactElement {
  const [wallet, setWallet] = useState("demo");
  const [hedges, setHedges] = useState<HedgeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem("watchman.wallet");
    if (stored) setWallet(stored);
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/hedges?wallet=${encodeURIComponent(wallet)}`).then(async (response) => {
      const data = (await response.json()) as { hedges?: HedgeRow[] };
      setHedges(data.hedges ?? []);
    }).finally(() => setLoading(false));
  }, [wallet]);

  return <main className="min-h-screen bg-black px-5 py-10 text-zinc-100 sm:px-8"><div className="mx-auto max-w-5xl"><div className="flex justify-between"><a href="/" className="text-sm text-zinc-500">← Watchman</a><a href="/protect" className="text-sm text-zinc-400">Protect another position</a></div><h1 className="mt-14 text-4xl font-semibold">Your hedges</h1><p className="mt-3 text-zinc-500">Every position Watchman has opened and is tracking.</p>{loading ? <div className="mt-10 h-32 animate-pulse rounded-2xl bg-zinc-900" /> : hedges.length === 0 ? <div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-950 p-10 text-center"><p className="text-lg">No hedges yet</p><p className="mt-2 text-sm text-zinc-500">Protect a position and it will appear here.</p></div> : <div className="mt-10 space-y-3">{hedges.map((hedge) => <a key={hedge.id} href={`/hedges/${hedge.id}`} className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-5 hover:border-zinc-600"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{hedge.asset} · {hedge.marketSymbol}</p><p className="mt-1 text-sm text-zinc-500">{hedge.protectionPct}% protection · {hedge.exposureUsd} exposure</p></div><span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-300">{hedge.status}</span></div><div className="mt-5 flex flex-wrap gap-6 text-sm"><span><b>{hedge.premiumUsd}</b> premium</span><span>expires {new Date(hedge.expiry).toLocaleString()}</span>{hedge.receipt && <span className="text-white">Receipt ready</span>}</div></a>)}</div>}</div></main>;
}
