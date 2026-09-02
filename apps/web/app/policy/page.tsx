"use client";

import { useState } from "react";

export default function PolicyPage(): React.ReactElement {
  const [asset, setAsset] = useState<"BTC" | "ETH">("BTC");
  const [pct, setPct] = useState(50);
  const [windowSeconds, setWindowSeconds] = useState<900 | 3600>(900);
  const [premium, setPremium] = useState(150);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const save = async (): Promise<void> => {
    try {
      const wallet = window.localStorage.getItem("watchman.wallet") ?? undefined;
      const response = await fetch("/api/policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, demo: !wallet, asset, protectionPct: pct / 100, windowSeconds, maxPremiumUsd: premium }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to save policy");
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save policy"); }
  };
  return <main className="min-h-screen bg-black px-6 py-12 text-zinc-100"><div className="mx-auto max-w-2xl"><a href="/" className="text-sm text-zinc-500">← Watchman</a><h1 className="mt-12 text-4xl font-semibold">Protection policy</h1><p className="mt-3 text-zinc-500">Tell Watchman the rule to follow. The Railway agent checks active policies and creates a hedge when the current exposure has no open hedge.</p><div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-950 p-7"><label className="block text-sm text-zinc-400">Asset<select value={asset} onChange={(e) => setAsset(e.target.value as "BTC" | "ETH")} className="mt-2 w-full rounded-xl bg-zinc-900 p-3 text-white"><option>BTC</option><option>ETH</option></select></label><div className="mt-7"><div className="flex justify-between text-sm"><span className="text-zinc-400">Protect</span><b>{pct}%</b></div><input type="range" min={10} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="mt-3 w-full accent-white" /></div><div className="mt-7 flex gap-2"><button onClick={() => setWindowSeconds(900)} className={`rounded-xl px-4 py-3 text-sm ${windowSeconds === 900 ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}>15 min</button><button onClick={() => setWindowSeconds(3600)} className={`rounded-xl px-4 py-3 text-sm ${windowSeconds === 3600 ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}>1 hour</button></div><label className="mt-7 block text-sm text-zinc-400">Maximum premium<input type="number" min={1} value={premium} onChange={(e) => setPremium(Number(e.target.value))} className="mt-2 w-full rounded-xl bg-zinc-900 p-3 text-white" /></label><button onClick={() => void save()} className="mt-8 w-full rounded-xl bg-white px-5 py-4 font-medium text-black">Save policy</button>{saved && <p className="mt-4 text-sm text-emerald-400">Policy saved. Watchman will evaluate it automatically.</p>}{error && <p className="mt-4 text-sm text-red-400">{error}</p>}</div></div></main>;
}
