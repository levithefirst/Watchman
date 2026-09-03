"use client";

import { useState } from "react";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { Arrow, BasisNote, Button, ButtonLink, Panel, Tag } from "../components/ui";
import { track } from "../components/analytics";
import { money } from "../components/format";

export default function PolicyPage(): React.ReactElement {
  const [asset, setAsset] = useState<"BTC" | "ETH">("BTC");
  const [pct, setPct] = useState(50);
  const [windowSeconds, setWindowSeconds] = useState<900 | 3600>(900);
  const [premium, setPremium] = useState(150);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(undefined);
    try {
      const wallet = window.localStorage.getItem("watchman.wallet") ?? undefined;
      const response = await fetch("/api/policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, demo: !wallet, asset, protectionPct: pct / 100, windowSeconds, maxPremiumUsd: premium }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to save policy");
      setSaved(true);
      track("policy_created", { asset, protectionPct: pct, windowSeconds, maxPremiumUsd: premium });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save policy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader variant="app" />
      <main id="main" className="min-h-screen bg-paper">
        <section className="wm-rays-soft wm-grain relative overflow-hidden border-b-[3px] border-ink">
          <div className="relative mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
            <Tag tone="pink">Standing policy</Tag>
            <h1 className="wm-display mt-7 text-[clamp(2.25rem,7vw,4.25rem)]">
              SET THE RULE. WALK AWAY.
            </h1>
            <p className="mt-6 max-w-xl text-lg font-medium leading-8 text-ink/80">
              Tell Watchman the protection you always want on. The settlement agent checks active
              policies every poll and opens a hedge whenever your exposure has none.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
          <Panel className="p-6 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="policy-asset" className="wm-eyebrow text-ink-mute">Asset</label>
                <select
                  id="policy-asset"
                  value={asset}
                  onChange={(e) => setAsset(e.target.value as "BTC" | "ETH")}
                  className="wm-input wm-select mt-2.5"
                >
                  <option>BTC</option>
                  <option>ETH</option>
                </select>
              </div>
              <div>
                <label htmlFor="policy-premium" className="wm-eyebrow text-ink-mute">Maximum premium (USD)</label>
                <input
                  id="policy-premium"
                  type="number"
                  min={1}
                  inputMode="decimal"
                  value={premium}
                  onChange={(e) => setPremium(Number(e.target.value))}
                  className="wm-input mt-2.5"
                />
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-end justify-between gap-4">
                <label htmlFor="policy-pct" className="wm-eyebrow text-ink-mute">Protect</label>
                <p className="wm-numeral text-3xl font-bold leading-none">{pct}%</p>
              </div>
              <input
                id="policy-pct"
                type="range"
                min={10}
                max={100}
                step={5}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="wm-range mt-4"
                style={{ ["--fill" as string]: `${((pct - 10) / 90) * 100}%` }}
              />
            </div>

            <div className="mt-8">
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

            <div className="mt-8 rounded-2xl border-[3px] border-ink bg-paper-deep p-5">
              <p className="wm-eyebrow text-ink-mute">Rule summary</p>
              <p className="mt-2.5 text-base font-medium leading-7">
                Keep <strong className="font-bold">{pct}%</strong> of my{" "}
                <strong className="font-bold">{asset}</strong> exposure protected for the next{" "}
                <strong className="font-bold">{windowSeconds === 3600 ? "hour" : "15 minutes"}</strong>,
                spending at most <strong className="font-bold">{money(premium)}</strong> in premium.
              </p>
            </div>

            <BasisNote className="mt-6" />

            <Button tone="yellow" size="lg" full className="group mt-7" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save policy"}
              {!saving ? <Arrow /> : null}
            </Button>

            {saved ? (
              <div role="status" className="mt-5 rounded-2xl border-[3px] border-ink bg-mint p-5">
                <p className="text-lg font-bold">Policy saved</p>
                <p className="mt-2 text-sm leading-6">
                  Watchman will evaluate it automatically and open a hedge when your exposure has none.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ButtonLink href="/hedges" tone="white" size="sm">View hedges</ButtonLink>
                  <ButtonLink href="/protect" tone="yellow" size="sm">Protect now</ButtonLink>
                </div>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-5 rounded-xl border-[3px] border-ink bg-flame px-4 py-3.5 text-sm font-bold text-paper">
                {error}
              </p>
            ) : null}
          </Panel>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
