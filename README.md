# Watchman

Watchman is short-duration portfolio insurance for crypto positions using DreamDEX Event Contracts on Somnia Shannon testnet.

## The pitch

**Protect a defined amount of BTC or ETH downside for the next 15 minutes or hour without selling the position.**

Watchman finds the cheapest currently-Trading Down Event Contract, sizes the hedge against a premium limit, executes an IOC order, watches settlement, redeems the winning position, and creates a permanent Hedge Receipt.

Watchman does not predict price direction. It turns binary Event Contracts into a risk-management primitive and explicitly shows basis risk because a binary contract is not a perfect put.

## Architecture

```text
apps/web
  Next.js 15 App Router
       │
       ├── /api/quote ───────────────┐
       └── /api/protect              │
                                     ▼
packages/sdk                    packages/db
  market discovery                 Prisma
  Trading gate                     Neon Postgres
  Down quote                       User → Exposure → Hedge → Receipt
  IOC execution
  redemption                         ▲
       ▲                              │
       │                              │
apps/agent ──────────────────────────┘
  settlement loop
  chain-head resolution checks
  explicit redemption
  receipt generation
```

The authoritative write gate is `getMarketOnchain(marketId).status === 1`. Indexed market data is used for discovery, then the chain is checked again immediately before an order is sent. Somnia's SDK documents the chain read as the authoritative source for write eligibility.

## Stack

- Next.js 15 + TypeScript + Tailwind
- Node.js TypeScript agent
- Neon Postgres + Prisma
- `@somnia-chain/markets-sdk` >= 0.28
- viem
- Vercel + Railway
- Somnia Shannon testnet, chain `50312`
- tUSDC `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E`, 6 decimals

## Local development

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev:web
```

Run the agent separately:

```bash
pnpm dev:agent
```

Run checks:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Environment

`DATABASE_URL` is the Neon connection string.

`PRIVATE_KEY` is the Somnia Shannon testnet execution wallet. Never commit it. The demo can create simulated hedges when this variable is absent. When it is present, the same protect flow prefers a real testnet IOC order.

`SETTLEMENT_POLL_MS` controls the Railway settlement loop and defaults to 10 seconds.

`VENUE_ID` and `OPERATOR_ID` are optional discovery configuration values.

## Demo walkthrough

1. Open `/demo`.
2. Start the demo.
3. Use the default `$10,000 BTC` exposure or edit it.
4. Select `50%` protection and `15 min`.
5. Set a maximum premium.
6. Review the live Down quote, contracts, premium and potential payout.
7. Click `Protect Position`.
8. Open the hedge detail page.
9. When the market resolves, the agent processes the hedge and creates the receipt.
10. Open the Hedge Receipt to see unhedged P&L, hedged P&L, payout, net protection and efficiency.

## Vercel

Deploy the repository with the web app as the Next.js application. Provide `DATABASE_URL` and, for real testnet execution, `PRIVATE_KEY` in the project environment. The root build generates Prisma Client before building workspace packages.

## Railway

Deploy the repository as a Node service.

Build command:

```bash
pnpm --filter @watchman/db generate && pnpm --filter @watchman/db build && pnpm --filter @watchman/sdk build && pnpm --filter @watchman/agent build
```

Start command:

```bash
pnpm --filter @watchman/agent start
```

Provide `DATABASE_URL`, `PRIVATE_KEY`, and optionally `SETTLEMENT_POLL_MS`.

## Risk model

For a hedge with exposure `E`, protection fraction `p`, Down price `q`, and `n` contracts:

```text
protected amount = E × p
premium          = n × q
potential payout = n
```

The engine also caps `n` by the premium budget and currently available liquidity.

After settlement:

```text
unhedged P&L = exposure × actual move
hedged P&L   = unhedged P&L + payout − premium
```

`net protection` is the portion of downside offset by the realized payout. Efficiency is net protection divided by premium paid.

These calculations intentionally do not pretend binary Event Contracts are equivalent to puts. Timing, strike/event definition, liquidity, binary settlement and the user's underlying exposure all create basis risk.

## Important implementation detail

Binary pools are recycled. A pool address is therefore not a permanent market identity. Watchman stores the bytes32 `marketId` and re-reads `getMarketOnchain(marketId)` for settlement and write eligibility.

Redemption is explicit. A resolved winning position remains a token balance until Watchman asks the settlement contract to redeem it.
