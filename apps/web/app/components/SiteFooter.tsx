export default function SiteFooter(): React.ReactElement {
  return (
    <footer className="border-t-[3px] border-ink bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg border-[3px] border-paper bg-pink">
                <span className="block h-2.5 w-2.5 rounded-full bg-ink" />
              </span>
              <span className="text-lg font-bold tracking-tight">WATCHMAN</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-paper/70">
              Short-duration portfolio insurance built on DreamDEX Event Contracts. Somnia Shannon
              testnet, chain 50312.
            </p>
          </div>

          <nav aria-label="Footer" className="flex gap-12 sm:gap-16">
            <div>
              <h2 className="wm-eyebrow text-paper/50">Product</h2>
              <ul className="mt-4 space-y-2.5 text-sm font-bold">
                <li>
                  <a href="/protect" className="text-paper no-underline hover:text-yellow">
                    Protect a position
                  </a>
                </li>
                <li>
                  <a href="/hedges" className="text-paper no-underline hover:text-yellow">
                    Active hedges
                  </a>
                </li>
                <li>
                  <a href="/policy" className="text-paper no-underline hover:text-yellow">
                    Standing policy
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h2 className="wm-eyebrow text-paper/50">Learn</h2>
              <ul className="mt-4 space-y-2.5 text-sm font-bold">
                <li>
                  <a href="/#how-it-works" className="text-paper no-underline hover:text-yellow">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="/#basis-risk" className="text-paper no-underline hover:text-yellow">
                    Basis risk
                  </a>
                </li>
                <li>
                  <a href="/#receipt" className="text-paper no-underline hover:text-yellow">
                    Hedge receipt
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 border-t-[3px] border-paper/20 pt-6 text-xs leading-6 text-paper/60">
          <p>
            Testnet software for demonstration. Event Contracts are binary outcomes, not perfect
            puts — a hedge can pay out differently from the loss on the underlying position. Nothing
            here is financial advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
