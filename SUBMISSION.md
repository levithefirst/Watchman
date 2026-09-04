# DoraHacks submission — copy/paste text

Everything below is written to be pasted directly into the submission form. Replace the demo link placeholder before submitting.

---

## Title

```
Watchman — Short-Duration Portfolio Insurance on DreamDEX
```

## Tagline / short description

(1-2 sentences, for the card/summary field)

```
Watchman is the risk-management layer for DreamDEX Event Contracts: give it an exposure, a protection target and a premium budget, and it finds the cheapest tradeable Down contract, sizes the hedge against real liquidity, executes, settles, redeems, and hands back a receipt showing exactly what the hedge did — including the basis difference between the binary payout and your actual loss.
```

## Long description

```
Problem

Holding BTC or ETH through a volatile window forces a bad tradeoff: sell the
position and eat the cost, or hold it and eat the drawdown. Perp hedges add
funding costs and liquidation risk, and real options aren't available to
most on-chain holders.

Solution

DreamDEX already lists short-duration binary Event Contracts on Somnia that
could hedge this — but they're a raw trading primitive. Someone still has
to find the right market, size a position against their actual exposure,
execute before the window closes, track settlement, and figure out what
happened to their money.

Watchman is that missing layer. Give it an exposure, a protection
percentage, and a premium budget, and it:

1. Finds the cheapest currently-tradeable Down Event Contract on DreamDEX
2. Sizes the hedge against the premium budget and available liquidity
3. Executes an IOC order (or simulates it in Demo mode)
4. Watches the market resolve and redeems the winning side automatically
5. Writes a permanent Hedge Receipt showing unhedged P&L vs. hedged P&L,
   payout, net protection, and efficiency — in plain numbers

Why it's different

Watchman is not a prediction bot — it only ever buys the Down side to
offset an existing long, sized to a protection percentage the user
chooses. The "alpha" is risk management, not forecasting. It's also
honest about basis risk: a binary Event Contract pays a fixed amount, not
a variable amount proportional to loss like a real put, and every receipt
shows that gap explicitly instead of hiding it. And it closes the loop
end to end — quote, size, execute, settle, redeem, and receipt are one
pipeline with one data model, not a UI bolted onto someone else's order
book.

Judges can try the entire flow with zero setup — no wallet, no faucet, no
funding required. Demo mode runs the real quoting and sizing logic against
live DreamDEX markets and only skips the final on-chain write, so the
numbers you see are real even when the transaction is simulated.

Best demo path

1. Click "Try Demo — $10k BTC, 50%, 15m" on the landing page
2. Review the live DreamDEX quote and click "Protect Position"
3. Open the created hedge to watch it being tracked
4. Open the Hedge Receipt once the window resolves to see exactly what
   the hedge did
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
https://web-mauve-beta-27.vercel.app
```

## Demo video link

```
ACTION REQUIRED — record with DEMO_SCRIPT.md, then paste the URL here before submitting.
```

## Repository

```
https://github.com/levithefirst/Watchman
```
