"use client";

import { useEffect, useState } from "react";

interface Receipt { id: string; hedgeId: string; exposureUsd: string; premiumUsd: string; actualMovePct: string; unhedgedPnlUsd: string; hedgedPnlUsd: string; payoutUsd: string; netProtectionUsd: string; efficiencyPct: string; createdAt: string }

const money = (value: string): string => { const n = Number(value); return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; };

function summarize(receipt: Receipt): string {
  const move = Number(receipt.actualMovePct);
  const payout = Number(receipt.payoutUsd);
  const netProtection = Number(receipt.netProtectionUsd);
  const direction = move < 0 ? "dropped" : move > 0 ? "rose" : "was flat";
  const payoutClause = payout > 0 ? `the hedge paid out ${money(receipt.payoutUsd)}, offsetting ${netProtection >= 0 ? "" : "part of "}the loss by ${money(receipt.netProtectionUsd)} net of premium` : `the hedge paid out $0 — the event resolved in the position's favor, so the only cost was the ${money(receipt.premiumUsd)} premium`;
  return `The underlying ${direction} ${Math.abs(move).toFixed(2)}% over the protection window. As a result, ${payoutClause}.`;
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }): React.ReactElement {
  const [receipt, setReceipt] = useState<Receipt>();
  const [error, setError] = useState<string>();
  useEffect(() => { void params.then(({ id }) => fetch(`/api/receipt/${id}`).then(async (response) => { const data = (await response.json()) as { receipt?: Receipt; error?: string }; if (!response.ok) throw new Error(data.error); setReceipt(data.receipt); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load receipt"))); }, [params]);

  if (error) return <main className="min-h-screen bg-black px-5 py-12 text-zinc-100"><div className="mx-auto max-w-lg rounded-2xl border border-red-900 bg-red-950/20 p-6 text-sm text-red-300">{error}</div></main>;
  if (!receipt) return (
    <main className="min-h-screen bg-black px-5 py-12 text-zinc-100">
      <div className="mx-auto max-w-3xl animate-pulse rounded-[2rem] border border-zinc-800 bg-zinc-950 p-7 sm:p-10">
        <div className="h-3 w-40 rounded bg-zinc-900" />
        <div className="mt-4 h-10 w-64 rounded bg-zinc-900" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-zinc-900" />)}</div>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-black px-5 py-10 text-zinc-100 sm:py-12">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-zinc-800 bg-zinc-950 p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Watchman Hedge Receipt</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">Protection settled</h1>
          </div>
          <span className="text-xs text-zinc-500">{new Date(receipt.createdAt).toLocaleDateString()}</span>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">What the hedge actually did</p>
          <p className="mt-2 leading-7 text-zinc-200">{summarize(receipt)}</p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Metric label="Exposure" value={money(receipt.exposureUsd)} />
          <Metric label="Premium" value={money(receipt.premiumUsd)} />
          <Metric label="Actual move" value={`${receipt.actualMovePct}%`} />
          <Metric label="Payout" value={money(receipt.payoutUsd)} />
          <Metric label="Unhedged P&L" value={money(receipt.unhedgedPnlUsd)} />
          <Metric label="Hedged P&L" value={money(receipt.hedgedPnlUsd)} />
        </div>

        <div className="mt-6 rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-6">
          <p className="text-sm text-zinc-400">Net protection</p>
          <p className="mt-2 text-4xl font-semibold">{money(receipt.netProtectionUsd)}</p>
          <p className="mt-3 text-sm text-zinc-400">Efficiency {receipt.efficiencyPct}%</p>
        </div>

        <div className="mt-8 rounded-2xl border border-amber-900/50 bg-amber-950/10 p-5 text-xs leading-6 text-amber-200/80">
          <strong className="text-amber-200">Basis risk remains.</strong> A binary Down Event Contract is defined by its event window and settlement rule and does not replicate a perfect put on the portfolio. The payout above reflects the contract's actual settlement, not a synthetic hedge model.
        </div>
      </article>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string }): React.ReactElement { return <div className="rounded-2xl border border-zinc-800 p-5"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-lg font-medium">{value}</p></div>; }
