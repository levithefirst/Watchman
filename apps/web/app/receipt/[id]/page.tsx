"use client";

import { useEffect, useState } from "react";

interface Receipt { id: string; hedgeId: string; exposureUsd: string; premiumUsd: string; actualMovePct: string; unhedgedPnlUsd: string; hedgedPnlUsd: string; payoutUsd: string; netProtectionUsd: string; efficiencyPct: string; createdAt: string }

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const [receipt, setReceipt] = useState<Receipt>();
  const [error, setError] = useState<string>();
  useEffect(() => { void params.then(({ id }) => fetch(`/api/receipt/${id}`).then(async (response) => { const data = (await response.json()) as { receipt?: Receipt; error?: string }; if (!response.ok) throw new Error(data.error); setReceipt(data.receipt); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load receipt"))); }, [params]);
  if (error) return <main className="min-h-screen bg-black p-8 text-zinc-100">{error}</main>;
  if (!receipt) return <main className="min-h-screen bg-black p-8 text-zinc-500">Loading receipt…</main>;
  return <main className="min-h-screen bg-black px-5 py-12 text-zinc-100"><article className="mx-auto max-w-3xl rounded-[2rem] border border-zinc-800 bg-zinc-950 p-7 sm:p-10"><div className="flex justify-between gap-5"><div><p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Watchman Hedge Receipt</p><h1 className="mt-3 text-4xl font-semibold">Protection settled</h1></div><span className="text-xs text-zinc-500">{new Date(receipt.createdAt).toLocaleDateString()}</span></div><p className="mt-5 max-w-2xl text-zinc-400">A permanent record of what the hedge cost, what the underlying exposure lost, and how much the Event Contract offset.</p><div className="mt-10 grid gap-3 sm:grid-cols-2"><Metric label="Exposure" value={`$${receipt.exposureUsd}`} /><Metric label="Premium" value={`$${receipt.premiumUsd}`} /><Metric label="Actual move" value={`${receipt.actualMovePct}%`} /><Metric label="Payout" value={`$${receipt.payoutUsd}`} /><Metric label="Unhedged P&L" value={`$${receipt.unhedgedPnlUsd}`} /><Metric label="Hedged P&L" value={`$${receipt.hedgedPnlUsd}`} /></div><div className="mt-6 rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-6"><p className="text-sm text-zinc-400">Net protection</p><p className="mt-2 text-4xl font-semibold">${receipt.netProtectionUsd}</p><p className="mt-3 text-sm text-zinc-400">Efficiency {receipt.efficiencyPct}%</p></div><p className="mt-8 text-xs leading-5 text-zinc-600">Basis risk remains: a binary Down Event Contract is defined by its event window and settlement rule and does not replicate a perfect put on the portfolio.</p></article></main>;
}
function Metric({ label, value }: { label: string; value: string }): React.ReactElement { return <div className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-lg font-medium">{value}</p></div>; }
