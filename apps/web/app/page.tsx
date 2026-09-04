import type { Metadata } from "next";
import SiteHeader from "./components/SiteHeader";
import SiteFooter from "./components/SiteFooter";
import Reveal from "./components/Reveal";
import { Arrow, ButtonLink, Panel, SectionLabel, Tag } from "./components/ui";
import CtaLink from "./components/CtaLink";
import { count, money, pct, signedMoney } from "./components/format";
import {
  SHOWCASE_OVERSHOOT,
  SHOWCASE_DOWN_PRICE,
  SHOWCASE_INPUT,
  SHOWCASE_MOVE_PCT,
  SHOWCASE_QUOTE,
  SHOWCASE_RESULT,
} from "./components/scenario";

export const metadata: Metadata = {
  title: "Watchman: Keep the position. Protect the downside.",
  description:
    "Watchman turns DreamDEX Event Contracts into short-duration portfolio insurance. Protect a defined amount of BTC or ETH downside for the next 15 minutes or hour without selling.",
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    n: "01",
    title: "QUOTE",
    body: "Watchman scans live DreamDEX markets and finds the cheapest Down contract that is actually trading right now.",
    tone: "bg-blue",
  },
  {
    n: "02",
    title: "HEDGE",
    body: "It sizes the position against your premium budget and available liquidity, then buys enough contracts to cover the exposure you chose.",
    tone: "bg-pink",
  },
  {
    n: "03",
    title: "WATCH",
    body: "The settlement agent tracks the contract on-chain until its window closes, and redeems the winning side automatically.",
    tone: "bg-yellow",
  },
  {
    n: "04",
    title: "RECEIPT",
    body: "You get a receipt showing what the market did, what the hedge paid, and the exact difference between them.",
    tone: "bg-white",
  },
] as const;

export default function Home(): React.ReactElement {
  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* ---------------------------------------------- HERO */}
        <section
          aria-labelledby="hero-title"
          className="wm-rays wm-grain relative overflow-hidden border-b-[3px] border-ink"
          style={{ ["--ry" as string]: "30%" }}
        >
          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tag tone="pink">Portfolio insurance</Tag>
              <Tag tone="white" className="hidden sm:inline-flex">
                Somnia Shannon · 50312
              </Tag>
            </div>

            <h1
              id="hero-title"
              className="wm-display mt-10 text-[clamp(2.75rem,10vw,7rem)] text-ink sm:mt-12"
            >
              KEEP THE POSITION.
              <br />
              <span className="relative inline-block">
                PROTECT THE
                <br className="sm:hidden" /> DOWNSIDE.
              </span>
            </h1>

            {/* Single clear sentence, on paper, so it reads instantly against the rays. */}
            <div className="mt-10 max-w-2xl rounded-[22px] border-[3px] border-ink bg-white p-6 shadow-[6px_6px_0_0_#111] sm:p-7">
              <p className="text-lg font-medium leading-8 text-ink sm:text-xl sm:leading-9">
                Watchman buys short-duration <strong className="font-bold">Down Event Contracts</strong>{" "}
                on DreamDEX to offset a defined amount of downside on your BTC or ETH position, then
                shows you exactly what the hedge did.
              </p>
            </div>

            <div className="mt-9 flex flex-col gap-3.5 sm:flex-row sm:items-center">
              <CtaLink
                href="/protect"
                tone="yellow"
                size="lg"
                location="hero"
                label="protect_a_position"
                className="group"
              >
                Protect a position <Arrow />
              </CtaLink>
              <ButtonLink href="#how-it-works" tone="white" size="lg" className="group">
                See how it works
              </ButtonLink>
            </div>

            <p className="mt-5 text-sm font-bold text-ink/70">
              No wallet or funding needed. Demo mode runs the whole pipeline in simulation.
            </p>

            {/* Three fact tiles, offset for poster rhythm. */}
            <ul className="mt-14 grid gap-4 sm:mt-20 sm:grid-cols-3">
              {[
                ["15 MIN / 1 HR", "Short protection windows"],
                ["LIVE MARKETS", "Cheapest valid Down quote"],
                ["FULL RECEIPT", "Exact realized protection"],
              ].map(([big, small], i) => (
                <Reveal key={big} as="li" delay={i * 90}>
                  <div
                    className={`wm-lift h-full rounded-[22px] border-[3px] border-ink bg-white p-6 shadow-[6px_6px_0_0_#111] ${
                      i === 1 ? "sm:translate-y-4" : ""
                    }`}
                  >
                    <p className="text-xl font-bold tracking-tight sm:text-2xl">{big}</p>
                    <p className="mt-2 text-sm font-medium text-ink-soft">{small}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------- PROBLEM */}
        <section
          aria-labelledby="problem-title"
          className="border-b-[3px] border-ink bg-paper"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
              <SectionLabel>The problem</SectionLabel>
              <h2
                id="problem-title"
                className="wm-display mt-8 max-w-4xl text-[clamp(2rem,6vw,4.25rem)]"
              >
                YOU EITHER SELL, OR YOU EAT THE DROP.
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              <Reveal delay={60}>
                <Panel className="h-full p-7">
                  <p className="wm-numeral text-5xl font-bold text-pink">01</p>
                  <h3 className="mt-4 text-xl font-bold">Selling costs you the position</h3>
                  <p className="mt-3 text-base leading-7 text-ink-soft">
                    You wanted the exposure. Closing it to dodge one volatile hour means buying back
                    higher, or watching the recovery from the sidelines.
                  </p>
                </Panel>
              </Reveal>
              <Reveal delay={130}>
                <Panel className="h-full p-7">
                  <p className="wm-numeral text-5xl font-bold text-pink">02</p>
                  <h3 className="mt-4 text-xl font-bold">Perps add a second problem</h3>
                  <p className="mt-3 text-base leading-7 text-ink-soft">
                    A short hedge brings funding costs and a liquidation price. Now you are managing
                    the hedge as carefully as the position it was meant to protect.
                  </p>
                </Panel>
              </Reveal>
              <Reveal delay={200}>
                <Panel className="h-full p-7">
                  <p className="wm-numeral text-5xl font-bold text-pink">03</p>
                  <h3 className="mt-4 text-xl font-bold">Options aren&apos;t really available</h3>
                  <p className="mt-3 text-base leading-7 text-ink-soft">
                    Short-dated on-chain puts on the size a normal holder actually has? Not
                    practically, and not in the next fifteen minutes.
                  </p>
                </Panel>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <div className="mt-6 rounded-[22px] border-[3px] border-ink bg-ink p-8 text-paper shadow-[6px_6px_0_0_#111] sm:p-12">
                <p className="text-2xl font-bold leading-9 tracking-tight sm:text-[2rem] sm:leading-[1.35]">
                  DreamDEX already lists short-duration binary Event Contracts that could hedge
                  this. They&apos;re a raw trading primitive, and someone still has to find the right
                  market, size it against real exposure, and execute before the window closes.
                  <span className="text-yellow"> Watchman is that missing layer.</span>
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------- HOW IT WORKS */}
        <section
          id="how-it-works"
          aria-labelledby="how-title"
          className="wm-rays-soft wm-grain relative overflow-hidden border-b-[3px] border-ink scroll-mt-20"
        >
          <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
              <SectionLabel tone="yellow">How Watchman works</SectionLabel>
              <h2 id="how-title" className="wm-display mt-8 max-w-3xl text-[clamp(2rem,6vw,4.25rem)]">
                FOUR STEPS. NOTHING HIDDEN.
              </h2>
            </Reveal>

            <ol className="mt-14 grid gap-5 sm:grid-cols-2">
              {STEPS.map((step, i) => (
                <Reveal key={step.n} as="li" delay={i * 80}>
                  <div
                    className={`wm-lift flex h-full flex-col rounded-[22px] border-[3px] border-ink ${step.tone} p-7 shadow-[6px_6px_0_0_#111] sm:p-8`}
                  >
                    <div className="flex items-baseline gap-5">
                      <span className="wm-numeral text-[3.5rem] font-bold leading-none sm:text-[4.5rem]">
                        {step.n}
                      </span>
                      <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">{step.title}</h3>
                    </div>
                    <p className="mt-5 text-base leading-7 text-ink-soft">{step.body}</p>
                  </div>
                </Reveal>
              ))}
            </ol>

            <Reveal delay={120}>
              <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <CtaLink
                  href="/protect"
                  tone="yellow"
                  size="lg"
                  location="how_it_works"
                  label="try_it_now"
                  className="group"
                >
                  Try it now <Arrow />
                </CtaLink>
                <p className="text-sm font-bold text-ink/70">
                  Runs against live DreamDEX markets in demo mode.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------- PROTECTION PREVIEW */}
        <section
          id="protection"
          aria-labelledby="protection-title"
          className="border-b-[3px] border-ink bg-paper scroll-mt-20"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <SectionLabel>Set your protection</SectionLabel>
                <h2
                  id="protection-title"
                  className="wm-display mt-8 text-[clamp(2rem,5.5vw,3.75rem)]"
                >
                  FIVE INPUTS. ONE LIVE QUOTE.
                </h2>
                <p className="mt-6 max-w-lg text-lg leading-8 text-ink-soft">
                  Choose the asset, how much exposure you&apos;re carrying, how much of it to
                  protect, the window, and the most you&apos;ll pay. Watchman quotes the real market
                  and tells you what it can actually fill.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    "Asset: BTC or ETH",
                    "Exposure: the position you're carrying",
                    "Protection: how much downside to cover",
                    "Window: next 15 minutes or hour",
                    "Max premium: your hard cost ceiling",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-base font-medium">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 block h-3 w-3 shrink-0 rounded-sm border-[3px] border-ink bg-pink"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-9">
                  <CtaLink
                    href="/protect"
                    tone="yellow"
                    size="lg"
                    location="protection_preview"
                    label="open_protection"
                    className="group"
                  >
                    Open protection <Arrow />
                  </CtaLink>
                </div>
              </Reveal>

              {/* Static visual echo of the real /protect quote panel. */}
              <Reveal delay={120}>
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="absolute -inset-3 -z-10 rounded-[26px] border-[3px] border-ink bg-blue"
                  />
                  <Panel className="p-7 sm:p-8">
                    <div className="flex items-center justify-between">
                      <p className="wm-eyebrow text-ink-mute">Live quote</p>
                      <Tag tone="blue" className="!shadow-none !px-3 !py-1 text-[10px]">
                        Demo
                      </Tag>
                    </div>
                    <p className="wm-numeral mt-6 text-6xl font-bold leading-none">
                      {(SHOWCASE_DOWN_PRICE * 100).toFixed(1)}¢
                    </p>
                    <p className="mt-2 text-sm font-medium text-ink-soft">
                      Down price · BTC-15M
                    </p>
                    <dl className="mt-8 divide-y-[3px] divide-ink/10">
                      {[
                        ["Down contracts", count(SHOWCASE_QUOTE.contractsToBuy)],
                        ["Premium paid", money(SHOWCASE_QUOTE.premiumUsd)],
                        ["Max payout if it resolves Down", money(SHOWCASE_QUOTE.potentialPayoutUsd)],
                        ["Premium / covered amount", pct(SHOWCASE_QUOTE.costPctOfProtected)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-4 py-3">
                          <dt className="text-sm font-medium text-ink-soft">{k}</dt>
                          <dd className="wm-numeral text-lg font-bold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="wm-press mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow px-5 py-4 text-base font-bold uppercase tracking-wide">
                      Protect position
                    </div>
                  </Panel>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- HEDGE RECEIPT */}
        <section
          id="receipt"
          aria-labelledby="receipt-title"
          className="border-b-[3px] border-ink bg-ink text-paper scroll-mt-20"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
              <Reveal>
                <SectionLabel tone="pink">Hedge receipt</SectionLabel>
                <h2
                  id="receipt-title"
                  className="wm-display mt-8 text-[clamp(2.25rem,6vw,4.5rem)] text-paper"
                >
                  NO HIDDEN OUTCOME.
                </h2>
                <p className="mt-6 max-w-lg text-lg leading-8 text-paper/75">
                  When the window closes, Watchman doesn&apos;t just say &ldquo;you were
                  protected.&rdquo; It shows the market move, the premium you paid, the payout you
                  received, and the basis difference between the hedge and your actual loss.
                </p>
                <p className="mt-6 max-w-lg text-lg leading-8 text-paper/75">
                  Most products bury that gap. It is the single most important number for judging
                  whether a hedge was worth buying, so we put it on the receipt.
                </p>
                <div className="mt-9">
                  <CtaLink
                    href="/hedges"
                    tone="yellow"
                    size="lg"
                    location="receipt_section"
                    label="view_hedges"
                    className="group"
                  >
                    See your hedges <Arrow />
                  </CtaLink>
                </div>
              </Reveal>

              {/* Receipt object: illustrative sample; live values render on /receipt/[id]. */}
              <Reveal delay={120}>
                <div className="rounded-[22px] border-[3px] border-ink bg-paper p-7 text-ink shadow-[10px_10px_0_0_#ff5fd0] sm:p-9">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-bold tracking-tight">WATCHMAN</p>
                      <p className="wm-eyebrow mt-1 text-ink-mute">Hedge receipt</p>
                    </div>
                    <span className="rounded-full border-[3px] border-ink bg-mint px-3 py-1 text-[11px] font-bold uppercase tracking-widest">
                      Settled
                    </span>
                  </div>

                  <div className="wm-dotline my-7" />

                  <dl className="space-y-5">
                    <div>
                      <dt className="wm-eyebrow text-ink-mute">What you held</dt>
                      <dd className="wm-numeral mt-1.5 text-2xl font-bold">
                        {money(SHOWCASE_INPUT.exposureUsd)} BTC
                      </dd>
                    </div>
                    <div>
                      <dt className="wm-eyebrow text-ink-mute">What you bought</dt>
                      <dd className="wm-numeral mt-1.5 text-2xl font-bold">
                        {count(SHOWCASE_QUOTE.contractsToBuy)} Down @ {(SHOWCASE_DOWN_PRICE * 100).toFixed(0)}¢
                      </dd>
                      <dd className="mt-1 text-sm font-bold text-ink-soft">
                        {money(SHOWCASE_QUOTE.premiumUsd)} premium · 15 min window
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6">
                      <div>
                        <dt className="wm-eyebrow text-ink-mute">What happened</dt>
                        <dd className="wm-numeral mt-1.5 text-2xl font-bold">
                          {SHOWCASE_MOVE_PCT.toFixed(2)}%
                        </dd>
                        <dd className="mt-1 text-sm font-bold text-ink-soft">
                          {signedMoney(SHOWCASE_RESULT.unhedgedPnlUsd)} unhedged
                        </dd>
                      </div>
                      <div>
                        <dt className="wm-eyebrow text-ink-mute">What it paid</dt>
                        <dd className="wm-numeral mt-1.5 text-2xl font-bold">
                          {money(SHOWCASE_RESULT.hedgePayoutUsd)}
                        </dd>
                        <dd className="mt-1 text-sm font-bold text-ink-soft">
                          {signedMoney(SHOWCASE_RESULT.hedgedPnlUsd)} hedged
                        </dd>
                      </div>
                    </div>
                  </dl>

                  <div className="wm-dotline my-7" />

                  <div className="rounded-2xl border-[3px] border-ink bg-yellow p-5">
                    <p className="wm-eyebrow text-ink/70">Overshoot</p>
                    <p className="wm-numeral mt-2 text-4xl font-bold">{signedMoney(SHOWCASE_OVERSHOOT)}</p>
                    <p className="mt-2 text-sm font-medium leading-6">
                      The binary paid {money(SHOWCASE_RESULT.hedgePayoutUsd)} against a{" "}
                      {money(Math.abs(SHOWCASE_RESULT.unhedgedPnlUsd))} loss. It <em>overshot</em>, because a
                      binary pays its full face value or nothing, so it rarely equals your actual
                      loss. That gap is the number a put wouldn&apos;t have.
                    </p>
                  </div>

                  <p className="mt-6 text-xs leading-5 text-ink-mute">
                    Worked example at a {(SHOWCASE_DOWN_PRICE * 100).toFixed(0)}¢ Down price, and every
                    figure above is computed by the same <code>quoteHedge</code> and{" "}
                    <code>calculateEffectiveness</code> functions the product runs, so this page
                    cannot show a number Watchman would not actually produce. Live receipts render
                    your hedge&apos;s real settled values.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------- BASIS RISK */}
        <section
          id="basis-risk"
          aria-labelledby="basis-title"
          className="border-b-[3px] border-ink bg-yellow scroll-mt-20"
        >
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <Reveal>
              <SectionLabel tone="white">Basis risk</SectionLabel>
              <h2
                id="basis-title"
                className="wm-display mt-8 max-w-4xl text-[clamp(2.25rem,7vw,5rem)]"
              >
                A HEDGE IS NOT A PROMISE.
              </h2>
            </Reveal>

            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <Reveal delay={60}>
                <div className="h-full rounded-[22px] border-[3px] border-ink bg-paper p-8 shadow-[6px_6px_0_0_#111]">
                  <p className="text-xl font-bold leading-8 sm:text-2xl sm:leading-9">
                    Event Contracts are binary outcomes, not perfect puts. A hedge can pay out
                    differently from the exact loss on the underlying position.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={130}>
                <div className="h-full rounded-[22px] border-[3px] border-ink bg-ink p-8 text-paper shadow-[6px_6px_0_0_#111]">
                  <p className="text-xl font-bold leading-8 sm:text-2xl sm:leading-9">
                    Watchman shows that difference explicitly instead of hiding it.
                    <span className="text-yellow"> This honesty is part of the product.</span>
                  </p>
                </div>
              </Reveal>
            </div>

            <Reveal delay={160}>
              <ul className="mt-6 grid gap-5 sm:grid-cols-3">
                {[
                  [
                    "Fixed payout",
                    "A contract pays a set amount per contract regardless of how far past the boundary the market moved.",
                  ],
                  [
                    "Bounded window",
                    "A 15-minute contract covers 15 minutes. A move that starts after expiry is not covered.",
                  ],
                  [
                    "Real liquidity",
                    "If the book can't fill the protection you asked for, Watchman fills what it can and says so.",
                  ],
                ].map(([title, body]) => (
                  <li
                    key={title}
                    className="rounded-[22px] border-[3px] border-ink bg-paper/70 p-6"
                  >
                    <h3 className="text-lg font-bold">{title}</h3>
                    <p className="mt-2.5 text-sm leading-6 text-ink-soft">{body}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------- FINAL CTA */}
        <section
          aria-labelledby="final-title"
          className="wm-rays wm-grain relative overflow-hidden"
          style={{ ["--ry" as string]: "50%" }}
        >
          <div className="relative mx-auto max-w-6xl px-5 py-24 text-center sm:px-8 sm:py-32">
            <Reveal>
              <h2
                id="final-title"
                className="wm-display mx-auto max-w-4xl text-[clamp(2.25rem,7vw,5rem)]"
              >
                YOUR POSITION DOESN&apos;T HAVE TO BE ALL OR NOTHING.
              </h2>
              <p className="mx-auto mt-8 max-w-xl text-lg font-medium leading-8 text-ink/80">
                Protect a defined slice of the downside for the next fifteen minutes. Keep
                everything else.
              </p>
              <div className="mt-10 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
                <CtaLink
                  href="/protect"
                  tone="yellow"
                  size="lg"
                  location="final_cta"
                  label="try_watchman"
                  className="group w-full sm:w-auto"
                >
                  Try Watchman <Arrow />
                </CtaLink>
                <ButtonLink
                  href="/hedges"
                  tone="white"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  View hedges
                </ButtonLink>
              </div>
              <p className="mt-6 text-sm font-bold text-ink/70">
                Demo mode · no wallet, no funding, no setup
              </p>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
