export default function Home(): React.ReactElement {
  return (
    <main className="min-h-screen bg-[#07090d] px-6 py-16 text-zinc-100 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <p className="mb-5 text-sm font-medium tracking-[0.24em] text-zinc-500">WATCHMAN · SOMNIA SHANNON TESTNET</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-7xl">Turn DreamDEX Event Contracts into short-duration portfolio insurance.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">Watchman buys short-duration Down Event Contracts on DreamDEX to offset a defined amount of downside on a real or simulated position. It sizes the hedge, executes the order, watches settlement, and hands you a receipt showing exactly what the hedge did.</p>
        <div className="mt-10">
          <a href="/protect" className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-5 text-lg font-semibold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_20px_60px_-15px_rgba(255,255,255,0.35)] transition hover:bg-zinc-200 sm:w-auto">
            Try Demo — $10k BTC, 50%, 15m
            <span className="text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-700">→</span>
          </a>
          <p className="mt-3 text-xs text-zinc-600">No wallet, no funding, no setup. Demo mode runs the entire quote → hedge → settlement → receipt pipeline in simulation.</p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href="/protect" className="text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200">Connect a wallet instead →</a>
            <a href="/policy" className="text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-200">Set a standing policy →</a>
          </div>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {[["15m / 1h", "Short protection windows"], ["Live markets", "Cheapest valid Down quote"], ["Hedge Receipt", "Exact realized protection"]].map(([a, b]) => (
            <div key={a} className="rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6">
              <div className="text-xl font-medium">{a}</div>
              <div className="mt-2 text-sm text-zinc-500">{b}</div>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-amber-900/50 bg-amber-950/10 p-5 text-xs leading-6 text-amber-200/80 sm:max-w-3xl">
          <strong className="text-amber-200">Basis risk, stated plainly.</strong> Event Contracts are binary outcomes, not perfect puts. A hedge can pay out differently from the loss on the underlying position — Watchman shows that difference explicitly on every receipt instead of hiding it.
        </div>
      </div>
    </main>
  );
}
