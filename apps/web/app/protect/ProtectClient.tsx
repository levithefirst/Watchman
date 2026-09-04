"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { Arrow, BasisNote, Button, Panel, Row, Tag } from "../components/ui";
import { track } from "../components/analytics";
import { money, count, pct } from "../components/format";

const CHAIN_ID = 50312;
type Asset = "BTC" | "ETH";
type WindowSeconds = 900 | 3600;
interface QuoteResponse { quote: { marketId: string; symbol: string; asset: string; windowSeconds: number; expiry: number; upBid: number; downAsk: number; contractsAvailable: number; hedge: { protectedAmountUsd: number; contractsNeeded: number; contractsToBuy: number; premiumUsd: number; costPctOfProtected: number; potentialPayoutUsd: number; fullyFunded: boolean; reason?: string } } | null; balance?: number; liveExecutionAvailable?: boolean; error?: string }
interface ProtectResponse { hedgeId?: string; txHash?: string | null; simulated?: boolean; error?: string }

export default function ProtectClient(): React.ReactElement {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switchingChain } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== CHAIN_ID;

  const [mode, setMode] = useState<"demo" | "wallet">("demo");
  const [asset, setAsset] = useState<Asset>("BTC");
  const [exposureUsd, setExposureUsd] = useState(10000);
  const [protectionPct, setProtectionPct] = useState(50);
  const [windowSeconds, setWindowSeconds] = useState<WindowSeconds>(900);
  const [maxPremiumUsd, setMaxPremiumUsd] = useState(150);
  const [balance, setBalance] = useState<number>();
  const [quote, setQuote] = useState<QuoteResponse["quote"]>();
  const [quoteError, setQuoteError] = useState<string>();
  const [liveExecutionAvailable, setLiveExecutionAvailable] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [protecting, setProtecting] = useState(false);
  const [funding, setFunding] = useState(false);
  const [fundMessage, setFundMessage] = useState<string>();
  const [result, setResult] = useState<ProtectResponse>();
  const [error, setError] = useState<string>();

  // The wallet a live order executes as — only meaningful once connected to
  // the right chain. On the wrong chain we still show the tile as connected
  // (so "switch network" is visible) but never pass the address to the
  // pricing/execution request.
  const wallet = isConnected && !wrongNetwork ? address : undefined;

  const requestBody = useMemo(() => ({ asset, exposureUsd, protectionPct: protectionPct / 100, windowSeconds, maxPremiumUsd, wallet: wallet as `0x${string}` | undefined }), [asset, exposureUsd, protectionPct, windowSeconds, maxPremiumUsd, wallet]);
  const willSimulate = mode === "demo" || !liveExecutionAvailable;

  useEffect(() => {
    if (isConnected) { setMode("wallet"); track("wallet_connected", { chainId }); }
    else track("demo_started", { asset: "BTC", exposureUsd: 10000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoadingQuote(true); setQuoteError(undefined);
      track("quote_requested", { asset, exposureUsd, protectionPct, windowSeconds, maxPremiumUsd });
      try {
        const response = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
        const data = (await response.json()) as QuoteResponse;
        if (!response.ok) throw new Error(data.error ?? "Quote failed");
        setQuote(data.quote ?? undefined); setBalance(data.balance); setLiveExecutionAvailable(Boolean(data.liveExecutionAvailable));
        if (data.quote) track("quote_received", { downAsk: data.quote.downAsk, contracts: data.quote.hedge.contractsToBuy, premiumUsd: data.quote.hedge.premiumUsd });
        if (data.error && !data.quote) setQuoteError(data.error);
      } catch (cause) { setQuote(undefined); setQuoteError(cause instanceof Error ? cause.message : "Quote unavailable"); }
      finally { setLoadingQuote(false); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [requestBody, asset, exposureUsd, protectionPct, windowSeconds, maxPremiumUsd]);

  const fundWallet = async (): Promise<void> => {
    setFunding(true); setFundMessage(undefined); setError(undefined);
    track("faucet_requested");
    try {
      const response = await fetch("/api/faucet", { method: "POST" });
      const data = (await response.json()) as { hash?: string | null; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Faucet failed");
      setFundMessage(data.hash ? `Funded. ${data.hash.slice(0, 10)}…` : "Funded with test tUSDC.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Faucet failed"); }
    finally { setFunding(false); }
  };

  const protect = async (): Promise<void> => {
    setProtecting(true); setError(undefined); setResult(undefined);
    try {
      const response = await fetch("/api/protect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...requestBody, demo: mode === "demo" }) });
      const data = (await response.json()) as ProtectResponse;
      if (!response.ok) throw new Error(data.error ?? "Protection failed");
      setResult(data);
      track("protection_created", { hedgeId: data.hedgeId, simulated: data.simulated ?? true, asset, exposureUsd });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Protection failed"); }
    finally { setProtecting(false); }
  };

  const protectedUsd = exposureUsd * (protectionPct / 100);

  return (
    <>
      <SiteHeader variant="app" />
      <main id="main" className="bg-paper">
        {/* Page head */}
        <section className="wm-rays wm-grain relative overflow-hidden border-b-[3px] border-ink" style={{ ["--ry" as string]: "42%" }}>
          <div className="relative mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
            <Tag tone="pink">Protect a position</Tag>
            <h1 className="wm-display mt-7 text-[clamp(2.25rem,7vw,4.5rem)]">
              KEEP THE POSITION.
              <br />
              PROTECT THE DOWNSIDE.
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-8 text-ink/80">
              Set your exposure and how much of it to cover. Watchman quotes the cheapest live Down
              contract on DreamDEX and sizes the hedge to your premium budget.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr] lg:gap-8">
            {/* ------------------------------------- CONFIGURE */}
            <section aria-labelledby="configure-title">
              <Panel className="p-6 sm:p-8">
                <h2 id="configure-title" className="sr-only">Configure your protection</h2>

                {/* Mode switch */}
                <div role="group" aria-label="Execution mode" className="flex gap-2 rounded-2xl border-[3px] border-ink bg-paper-deep p-1.5">
                  <button
                    type="button"
                    onClick={() => { setMode("demo"); track("demo_started", { asset, exposureUsd }); }}
                    aria-pressed={mode === "demo"}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${mode === "demo" ? "border-[3px] border-ink bg-yellow shadow-[3px_3px_0_0_#111]" : "text-ink-soft hover:bg-white/60"}`}
                  >
                    Demo mode
                  </button>
                  <ConnectButton.Custom>
                    {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
                      const ready = mounted;
                      const connected = ready && account && chain;
                      return (
                        <button
                          type="button"
                          disabled={!ready}
                          onClick={() => {
                            if (!connected) { openConnectModal(); return; }
                            if (chain.unsupported) { openChainModal(); return; }
                            setMode("wallet");
                            openAccountModal();
                          }}
                          aria-pressed={mode === "wallet"}
                          className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${mode === "wallet" ? "border-[3px] border-ink bg-yellow shadow-[3px_3px_0_0_#111]" : "text-ink-soft hover:bg-white/60"} ${!ready ? "opacity-0" : ""}`}
                        >
                          {connected
                            ? chain.unsupported
                              ? "Wrong network"
                              : `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
                            : "Connect wallet"}
                        </button>
                      );
                    }}
                  </ConnectButton.Custom>
                </div>

                {wrongNetwork ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] border-ink bg-flame px-4 py-3.5 text-paper">
                    <p className="text-sm font-bold">
                      Wrong network — switch your wallet to Somnia Shannon (chain 50312) to use live
                      mode.
                    </p>
                    <Button
                      tone="white"
                      size="sm"
                      onClick={() => switchChain({ chainId: CHAIN_ID })}
                      disabled={switchingChain}
                    >
                      {switchingChain ? "Switching…" : "Switch network"}
                    </Button>
                  </div>
                ) : null}

                {/* Execution badge — must always be unmistakable */}
                <p
                  className={`mt-4 inline-flex items-center gap-2.5 rounded-full border-[3px] border-ink px-4 py-2 text-xs font-bold uppercase tracking-widest ${willSimulate ? "bg-blue" : "bg-mint"}`}
                >
                  <span aria-hidden="true" className={`block h-2.5 w-2.5 rounded-full ${willSimulate ? "bg-ink" : "bg-ink"}`} />
                  {willSimulate ? "Simulated order — no funds needed" : "Live testnet execution"}
                </p>

                {/* Asset + exposure */}
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="asset" className="wm-eyebrow text-ink-mute">Asset</label>
                    <select
                      id="asset"
                      value={asset}
                      onChange={(event) => setAsset(event.target.value as Asset)}
                      className="wm-input wm-select mt-2.5"
                    >
                      <option>BTC</option>
                      <option>ETH</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="exposure" className="wm-eyebrow text-ink-mute">Exposure (USD)</label>
                    <input
                      id="exposure"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={exposureUsd}
                      onChange={(event) => setExposureUsd(Number(event.target.value))}
                      className="wm-input mt-2.5"
                    />
                  </div>
                </div>

                {/* Protection */}
                <div className="mt-8">
                  <div className="flex items-end justify-between gap-4">
                    <label htmlFor="protection" className="wm-eyebrow text-ink-mute">Protection</label>
                    <p className="wm-numeral text-3xl font-bold leading-none">{protectionPct}%</p>
                  </div>
                  <input
                    id="protection"
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={protectionPct}
                    onChange={(event) => setProtectionPct(Number(event.target.value))}
                    className="wm-range mt-4"
                    style={{ ["--fill" as string]: `${((protectionPct - 10) / 90) * 100}%` }}
                    aria-describedby="protection-help"
                  />
                  <p id="protection-help" className="mt-3 text-sm font-medium text-ink-soft">
                    Target: a hedge that can pay out{" "}
                    <strong className="wm-tabular font-bold text-ink">{money(protectedUsd)}</strong> against
                    your {money(exposureUsd)} position. What the market can actually fill is shown in
                    the quote.
                  </p>
                </div>

                {/* Window + premium */}
                <div className="mt-8 grid gap-5 sm:grid-cols-2">
                  <div>
                    <span className="wm-eyebrow text-ink-mute">Protection window</span>
                    <div role="group" aria-label="Protection window" className="mt-2.5 flex gap-2.5">
                      {([[900, "15 min"], [3600, "1 hour"]] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setWindowSeconds(value)}
                          aria-pressed={windowSeconds === value}
                          className={`flex-1 rounded-xl border-[3px] border-ink px-4 py-3 text-sm font-bold uppercase tracking-wide transition-all ${windowSeconds === value ? "bg-pink shadow-[3px_3px_0_0_#111]" : "bg-white text-ink-soft hover:bg-paper-deep"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="premium" className="wm-eyebrow text-ink-mute">Max premium (USD)</label>
                    <input
                      id="premium"
                      type="number"
                      min={0.01}
                      step={1}
                      inputMode="decimal"
                      value={maxPremiumUsd}
                      onChange={(event) => setMaxPremiumUsd(Number(event.target.value))}
                      className="wm-input mt-2.5"
                    />
                  </div>
                </div>

                <BasisNote className="mt-8" />

                {mode === "wallet" ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[3px] border-ink bg-paper-deep p-4">
                    <span className="text-sm font-bold">
                      tUSDC balance:{" "}
                      <span className="wm-numeral">{balance === undefined ? "checking…" : money(balance)}</span>
                    </span>
                    <Button tone="white" size="sm" onClick={() => void fundWallet()} disabled={funding}>
                      {funding ? "Funding…" : "Fund with tUSDC"}
                    </Button>
                  </div>
                ) : null}

                {fundMessage ? (
                  <p role="status" className="mt-3 rounded-xl border-[3px] border-ink bg-mint px-4 py-3 text-sm font-bold">{fundMessage}</p>
                ) : null}

                {error ? (
                  <p role="alert" className="mt-4 rounded-xl border-[3px] border-ink bg-flame px-4 py-3.5 text-sm font-bold text-paper">{error}</p>
                ) : null}
              </Panel>
            </section>

            {/* ------------------------------------- QUOTE */}
            <section aria-labelledby="quote-title" className="lg:sticky lg:top-24 lg:self-start">
              <Panel className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="quote-title" className="wm-eyebrow text-ink-mute">Live quote</h2>
                  <Tag tone="blue" className="!px-3 !py-1 !shadow-none text-[10px]">Somnia 50312</Tag>
                </div>

                {loadingQuote && !quote ? (
                  <div className="mt-7 space-y-4" aria-live="polite" aria-busy="true">
                    <span className="sr-only">Loading quote…</span>
                    <div className="wm-skel h-14 w-40" />
                    <div className="wm-skel h-4 w-52" />
                    <div className="mt-8 space-y-3">
                      <div className="wm-skel h-6 w-full" />
                      <div className="wm-skel h-6 w-full" />
                      <div className="wm-skel h-6 w-full" />
                      <div className="wm-skel h-6 w-full" />
                    </div>
                    <div className="wm-skel h-14 w-full rounded-2xl" />
                  </div>
                ) : quote ? (
                  <div aria-live="polite">
                    <div className="mt-6 flex items-end gap-3">
                      <p className="wm-numeral text-6xl font-bold leading-none">{(quote.downAsk * 100).toFixed(1)}¢</p>
                      {loadingQuote ? <span className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-mute">updating…</span> : null}
                    </div>
                    <p className="mt-2 text-sm font-medium text-ink-soft">Down price · {quote.symbol}</p>

                    {/* Asked vs fillable — the number most products hide. */}
                    <div
                      className={`mt-7 rounded-2xl border-[3px] border-ink p-5 ${quote.hedge.fullyFunded ? "bg-mint" : "bg-yellow"}`}
                    >
                      <p className="wm-eyebrow text-ink/70">
                        {quote.hedge.fullyFunded ? "Fully fillable" : "Market can only partly fill this"}
                      </p>
                      <p className="wm-numeral mt-2 text-3xl font-bold leading-none">
                        {money(quote.hedge.potentialPayoutUsd)}{" "}
                        <span className="text-lg text-ink-soft">
                          of {money(quote.hedge.protectedAmountUsd)} asked
                        </span>
                      </p>
                      <div
                        className="mt-3 h-3 w-full overflow-hidden rounded-full border-[3px] border-ink bg-white"
                        role="img"
                        aria-label={`${((quote.hedge.contractsToBuy / Math.max(1, quote.hedge.contractsNeeded)) * 100).toFixed(0)} percent of requested cover is fillable`}
                      >
                        <div
                          className="h-full bg-ink"
                          style={{
                            width: `${Math.min(100, (quote.hedge.contractsToBuy / Math.max(1, quote.hedge.contractsNeeded)) * 100).toFixed(1)}%`,
                          }}
                        />
                      </div>
                      {!quote.hedge.fullyFunded ? (
                        <p className="mt-3 text-sm font-bold leading-6">{quote.hedge.reason}</p>
                      ) : null}
                    </div>

                    <dl className="mt-6 divide-y-[3px] divide-paper-deep">
                      <Row label="Down contracts" value={count(quote.hedge.contractsToBuy)} />
                      <Row label="Premium you pay" value={money(quote.hedge.premiumUsd)} strong />
                      <Row
                        label="Max payout if it resolves Down"
                        value={money(quote.hedge.potentialPayoutUsd)}
                        strong
                      />
                      <Row label="Premium / covered amount" value={pct(quote.hedge.costPctOfProtected)} />
                      <Row label="Worst case" value={`−${money(quote.hedge.premiumUsd)}`} />
                    </dl>

                    <p className="mt-4 text-xs leading-5 text-ink-soft">
                      Binary settlement: each contract pays $1.00 if BTC resolves Down over the
                      window, $0 otherwise. There is no partial payout, so this will not equal your
                      actual loss — the receipt shows the difference.
                    </p>

                    <Button
                      tone="yellow"
                      size="lg"
                      full
                      className="group mt-7"
                      disabled={protecting || quote.hedge.contractsToBuy <= 0}
                      onClick={() => void protect()}
                    >
                      {protecting ? "Protecting…" : "Protect position"}
                      {!protecting ? <Arrow /> : null}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-7 rounded-2xl border-[3px] border-ink bg-paper-deep p-6" aria-live="polite">
                    <p className="text-lg font-bold">No usable live quote</p>
                    <p className="mt-2.5 text-sm leading-6 text-ink-soft">
                      Watchman is waiting for a currently Trading DreamDEX market with Down
                      liquidity for this asset and window. Try the other window, or check back in a
                      moment.
                    </p>
                    {quoteError ? (
                      <details className="mt-4 rounded-xl border-[3px] border-ink bg-white px-4 py-3">
                        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-widest text-ink-soft">
                          Technical detail
                        </summary>
                        <p className="wm-numeral mt-3 break-words text-xs leading-5 text-ink-soft">
                          {quoteError}
                        </p>
                      </details>
                    ) : null}
                  </div>
                )}

                {result ? (
                  <div role="status" className="mt-6 rounded-2xl border-[3px] border-ink bg-mint p-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className="text-lg font-bold">Protection created</p>
                      {result.simulated ? (
                        <span className="rounded-full border-[3px] border-ink bg-blue px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                          Simulated order
                        </span>
                      ) : null}
                    </div>
                    <p className="wm-numeral mt-2 break-all text-xs font-bold text-ink-soft">{result.hedgeId}</p>
                    {result.simulated ? (
                      <p className="mt-3 text-sm leading-6">
                        No on-chain order was placed — the full pipeline ran in simulation so you can
                        see the whole flow without funding a wallet.
                      </p>
                    ) : result.txHash ? (
                      <a
                        className="mt-3 inline-block text-sm font-bold underline decoration-[3px] underline-offset-4"
                        href={`https://shannon-explorer.somnia.network/tx/${result.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transaction ↗
                      </a>
                    ) : null}
                    <a
                      href={`/hedges/${result.hedgeId}`}
                      className="wm-press mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3.5 text-sm font-bold uppercase tracking-wide text-paper no-underline"
                    >
                      View hedge
                    </a>
                  </div>
                ) : null}
              </Panel>

              <p className="mt-5 px-1 text-sm leading-6 text-ink-soft">
                Watchman re-checks the market on-chain immediately before sending any order. If the
                market stops trading, the quote is refused rather than filled at a stale price.
              </p>
            </section>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
