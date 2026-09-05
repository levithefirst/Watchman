# DoraHacks submission — copy/paste text

Everything below is written to be pasted directly into the submission form. Add the final demo-video URL when the recording is ready.

---

## Title

```
Watchman — Short-Duration Portfolio Insurance on DreamDEX
```

## Tagline / short description

```
Watchman is portfolio insurance for DreamDEX Event Contracts that tells you whether the hedge actually offset the loss, not another Up/Down trading UI.
```

## Long description

```
Problem

Holding BTC or ETH through a volatile window forces a bad tradeoff: sell the position or absorb the drawdown. Perp hedges add funding and liquidation risk, while short-dated on-chain options are not readily available for ordinary holders.

Solution

DreamDEX already lists short-duration binary Event Contracts on Somnia that can hedge downside. The raw primitive still leaves someone to find the right market, size the hedge against real exposure and liquidity, execute before the window closes, track settlement, and work out what the hedge actually did.

Watchman is that risk-management layer. Give it an exposure, a protection percentage, and a premium budget, and it:

1. Finds the cheapest currently-tradeable Down Event Contract
2. Sizes the hedge against the premium budget and live liquidity
3. Executes an IOC order, or simulates it in Demo mode
4. Tracks live settlement and redemption through the existing worker
5. Produces a Hedge Receipt showing exposure, premium, actual move, unhedged P&L, hedge payout, hedged P&L, gross loss offset, loss offset percentage, net hedge contribution, and overshoot

Why it is different

Watchman is a portfolio-insurance layer, not a prediction bot and not another Up/Down trading interface. It buys Down contracts to offset an existing long and makes the result measurable.

A binary Event Contract is not a put. Its payout is fixed, so it can under-cover or over-cover the actual loss. Watchman puts that basis risk directly on the receipt instead of hiding it behind a single protection number.

The sizing is also honest. If a user requests $5,000 of protection but the market can currently fill only $200, Watchman says so and limits the executable size rather than pretending the full amount is available.

Best demo path

1. Open https://watchman-beta.vercel.app/
2. Go to Protect. The default demo is BTC / 1 hour.
3. Observe the live quote and liquidity constraint.
4. Click Protect Position in Demo mode.
5. Open Hedges and select the created demo hedge.
6. Open the full receipt.
7. Compare unhedged P&L with hedged P&L and inspect loss offset, net hedge contribution, and overshoot where applicable.

Watchman does not just show that a hedge was bought. It shows what the hedge actually protected.

Demo mode is clearly labelled. The demo hedge uses the real quote and sizing result, then runs the existing effectiveness engine against a visible -3.00% scenario so judges do not have to wait for a market to resolve. No fake fill, transaction hash, or on-chain settlement is presented as real.
```

## Tech stack

```
Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4,
Prisma + Neon Postgres, @somnia-chain/markets-sdk, viem,
a standalone Node/TypeScript settlement worker,
deployed on Vercel (web) + Railway (agent),
Somnia Shannon testnet (chain 50312)
```

## Demo link

```
https://watchman-beta.vercel.app/
```

## Demo video link

```
PASTE FINAL 2–3 MINUTE VIDEO URL HERE AFTER RECORDING WITH DEMO_SCRIPT.md.
```

## Repository

```
https://github.com/levithefirst/Watchman
```
