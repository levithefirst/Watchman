"use client";

import { useEffect, useMemo, useState } from "react";

const CHAIN_ID = 50312;
type Asset = "BTC" | "ETH";
type WindowSeconds = 900 | 3600;
interface QuoteResponse { quote: { marketId: string; symbol: string; asset: string; windowSeconds: number; expiry: number; upBid: number; downAsk: number; contractsAvailable: number; hedge: { protectedAmountUsd: number; contractsNeeded: number; contractsToBuy: number; premiumUsd: number; costPctOfProtected: number; potentialPayoutUsd: number; fullyFunded: boolean; reason?: string } } | null; balance?: number; liveExecutionAvailable?: boolean; error?: string }
interface ProtectResponse { hedgeId?: string; txHash?: string | null; simulated?: boolean; error?: string }
interface EthereumProvider { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> }
declare global { interface Window { ethereum?: EthereumProvider } }
const money = (value: number): string => `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ProtectClient(): React.ReactElement {
  const [mode, setMode] = useState<"demo" | "wallet">("demo");
  const [asset, setAsset] = useState<Asset>("BTC");
  const [exposureUsd, setExposureUsd] = useState(10000);
  const [protectionPct, setProtectionPct] = useState(50);
  const [windowSeconds, setWindowSeconds] = useState<WindowSeconds>(900);
  const [maxPremiumUsd, setMaxPremiumUsd] = useState(150);
  const [wallet, setWallet] = useState<string>();
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

  const requestBody = useMemo(() => ({ asset, exposureUsd, protectionPct: protectionPct / 100, windowSeconds, maxPremiumUsd, wallet: wallet as `0x${string}` | undefined }), [asset, exposureUsd, protectionPct, windowSeconds, maxPremiumUsd, wallet]);
  const willSimulate = mode === "demo" || !liveExecutionAvailable;

  useEffect(() => {
    const stored = window.localStorage.getItem("watchman.wallet");
    if (stored) { setWallet(stored); setMode("wallet"); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoadingQuote(true); setQuoteError(undefined);
      try {
        const response = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
        const data = (await response.json()) as QuoteResponse;
        if (!response.ok) throw new Error(data.error ?? "Quote failed");
        setQuote(data.quote ?? undefined); setBalance(data.balance); setLiveExecutionAvailable(Boolean(data.liveExecutionAvailable));
        if (data.error && !data.quote) setQuoteError(data.error);
      } catch (cause) { setQuote(undefined); setQuoteError(cause instanceof Error ? cause.message : "Quote unavailable"); }
      finally { setLoadingQuote(false); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [requestBody]);

  const connectWallet = async (): Promise<void> => {
    setError(undefined);
    try {
      if (!window.ethereum) throw new Error("No injected wallet found. Use Demo mode or install a compatible wallet.");
      const chain = await window.ethereum.request({ method: "eth_chainId" });
      if (typeof chain !== "string" || Number.parseInt(chain, 16) !== CHAIN_ID) throw new Error("Switch your wallet to Somnia Shannon testnet (chain 50312).");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") throw new Error("Wallet connection returned no account.");
      setWallet(accounts[0]); window.localStorage.setItem("watchman.wallet", accounts[0]); setMode("wallet");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to connect wallet"); }
  };

  const fundWallet = async (): Promise<void> => {
    setFunding(true); setFundMessage(undefined); setError(undefined);
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Protection failed"); }
    finally { setProtecting(false); }
  };

  return <main className="min-h-screen bg-black px-5 py-10 text-zinc-100 sm:px-8"><div className="mx-auto max-w-5xl"><div className="flex items-center justify-between"><a href="/" className="text-sm text-zinc-500 hover:text-zinc-200">← Watchman</a><a href="/hedges" className="text-sm text-zinc-400 hover:text-white">Active hedges</a></div><div className="mt-14 max-w-3xl"><p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">Portfolio insurance</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Protect the downside. Keep the position.</h1><p className="mt-5 text-lg leading-8 text-zinc-400">Watchman buys short-duration Down Event Contracts around your exposure, then watches settlement and redeems the hedge for you.</p></div><div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8"><div className="flex gap-2 rounded-xl bg-zinc-900 p-1"><button onClick={() => setMode("demo")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm ${mode === "demo" ? "bg-white text-black" : "text-zinc-400"}`}>Demo mode</button><button onClick={() => void connectWallet()} className={`flex-1 rounded-lg px-4 py-2.5 text-sm ${mode === "wallet" ? "bg-white text-black" : "text-zinc-400"}`}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}</button></div><div className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${willSimulate ? "border border-amber-900/60 bg-amber-950/30 text-amber-300" : "border border-emerald-900/60 bg-emerald-950/30 text-emerald-300"}`}><span className={`h-1.5 w-1.5 rounded-full ${willSimulate ? "bg-amber-400" : "bg-emerald-400"}`} />{willSimulate ? "Simulated order — no funds needed" : "Live testnet execution"}</div><div className="mt-8 grid gap-5 sm:grid-cols-2"><label className="block text-sm text-zinc-400">Asset<select value={asset} onChange={(event) => setAsset(event.target.value as Asset)} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white"><option>BTC</option><option>ETH</option></select></label><label className="block text-sm text-zinc-400">Exposure USD<input type="number" min={1} value={exposureUsd} onChange={(event) => setExposureUsd(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white" /></label></div><div className="mt-8"><div className="flex justify-between text-sm"><span className="text-zinc-400">Protection</span><strong>{protectionPct}%</strong></div><input aria-label="Protection percentage" type="range" min={10} max={100} step={5} value={protectionPct} onChange={(event) => setProtectionPct(Number(event.target.value))} className="mt-4 w-full accent-white" /></div><div className="mt-8 grid gap-5 sm:grid-cols-2"><div><p className="text-sm text-zinc-400">Protection window</p><div className="mt-2 flex gap-2"><button onClick={() => setWindowSeconds(900)} className={`rounded-xl px-4 py-3 text-sm ${windowSeconds === 900 ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}>15 min</button><button onClick={() => setWindowSeconds(3600)} className={`rounded-xl px-4 py-3 text-sm ${windowSeconds === 3600 ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}>1 hour</button></div></div><label className="block text-sm text-zinc-400">Max premium<input type="number" min={0.01} step={1} value={maxPremiumUsd} onChange={(event) => setMaxPremiumUsd(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white" /></label></div><div className="mt-8 rounded-2xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm leading-6 text-amber-200/80"><strong className="text-amber-200">Basis risk.</strong> A Down Event Contract is binary protection for a defined event window. It is not a perfect put, so the payout can differ from your portfolio&apos;s exact loss.</div>{mode === "wallet" && <div className="mt-4 flex items-center justify-between text-sm text-zinc-500"><span>tUSDC balance: {balance === undefined ? "checking…" : money(balance)}</span><button onClick={() => void fundWallet()} disabled={funding} className="rounded-lg bg-zinc-900 px-3 py-2 text-zinc-300">{funding ? "Funding…" : "Fund with tUSDC"}</button></div>}{fundMessage && <p className="mt-3 text-xs text-emerald-400">{fundMessage}</p>}{error && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">{error}</p>}</section><aside className="h-fit rounded-3xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8"><div className="flex items-center justify-between"><p className="text-sm text-zinc-500">Live quote</p><span className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-400">Somnia 50312</span></div>{loadingQuote ? <div className="mt-8 space-y-4"><div className="h-10 animate-pulse rounded bg-zinc-900" /><div className="h-20 animate-pulse rounded bg-zinc-900" /><div className="h-10 animate-pulse rounded bg-zinc-900" /></div> : quote ? <><p className="mt-6 text-4xl font-semibold">{(quote.downAsk * 100).toFixed(2)}¢</p><p className="mt-1 text-sm text-zinc-500">Down price · {quote.symbol}</p><dl className="mt-8 space-y-4 text-sm"><div className="flex justify-between"><dt className="text-zinc-500">Contracts</dt><dd>{quote.hedge.contractsToBuy.toLocaleString()}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Premium</dt><dd>{money(quote.hedge.premiumUsd)}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Potential payout</dt><dd>{money(quote.hedge.potentialPayoutUsd)}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Cost / protected</dt><dd>{quote.hedge.costPctOfProtected.toFixed(2)}%</dd></div></dl>{!quote.hedge.fullyFunded && <p className="mt-6 text-xs leading-5 text-amber-300">{quote.hedge.reason}</p>}<button disabled={protecting || quote.hedge.contractsToBuy <= 0} onClick={() => void protect()} className="mt-8 w-full rounded-2xl bg-white px-5 py-4 font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">{protecting ? "Protecting…" : "Protect Position"}</button></> : <div className="mt-8 rounded-2xl bg-zinc-900/60 p-5"><p className="font-medium">No usable live quote</p><p className="mt-2 text-sm leading-6 text-zinc-500">{quoteError ?? "Waiting for a currently Trading DreamDEX market with Down liquidity."}</p></div>}{result && <div className="mt-5 rounded-2xl border border-emerald-900 bg-emerald-950/20 p-5"><div className="flex items-center gap-2"><p className="font-medium text-emerald-300">Protection created</p>{result.simulated && <span className="rounded-full border border-amber-900/60 bg-amber-950/30 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">Simulated order</span>}</div><p className="mt-2 text-sm text-zinc-400">Hedge {result.hedgeId}</p>{result.simulated ? <p className="mt-2 text-xs text-zinc-500">No on-chain order was placed — this ran the full pipeline in simulation so you can see the whole flow without funding a wallet. Set PRIVATE_KEY for real testnet execution.</p> : result.txHash ? <a className="mt-2 block text-sm text-white underline" href={`https://shannon-explorer.somnia.network/tx/${result.txHash}`} target="_blank" rel="noreferrer">View transaction</a> : null}<a href={`/hedges/${result.hedgeId}`} className="mt-4 inline-block text-sm text-white underline">View hedge</a></div>}</aside></div></div></main>;
}
