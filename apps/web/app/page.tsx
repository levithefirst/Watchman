export default function Home(): React.ReactElement {
  return (
    <main className="min-h-screen bg-[#07090d] px-6 py-20 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <p className="mb-5 text-sm font-medium tracking-[0.24em] text-zinc-500">WATCHMAN · SOMNIA SHANNON</p>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight md:text-7xl">Protect a crypto position before the move happens.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">Watchman buys short-duration Down Event Contracts on DreamDEX to offset a defined amount of downside. It manages the hedge, settlement and receipt for you.</p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a href="/protect" className="rounded-xl bg-white px-6 py-3 font-medium text-black">Protect my position</a>
          <a href="/demo" className="rounded-xl border border-zinc-800 px-6 py-3 font-medium text-zinc-200">Try demo mode</a>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[["15m / 1h", "Short protection windows"], ["Live markets", "Cheapest valid Down quote"], ["Hedge Receipt", "Exact realized protection"]].map(([a,b]) => <div key={a} className="rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6"><div className="text-xl font-medium">{a}</div><div className="mt-2 text-sm text-zinc-500">{b}</div></div>)}
        </div>
        <p className="mt-10 max-w-3xl text-xs leading-6 text-zinc-600">Basis risk: Event Contracts are binary outcomes, not perfect puts. A hedge can pay out differently from the loss on the underlying position, and Watchman shows that difference explicitly.</p>
      </div>
    </main>
  );
}
