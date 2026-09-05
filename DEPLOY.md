# Deploying Watchman

> **Canonical live deployment:** https://watchman-beta.vercel.app/

Watchman is two services sharing one Neon Postgres database:

- `apps/web` on Vercel, used by judges.
- `apps/agent` on Railway, the continuous settlement/policy worker.

## 0. Database

Create a Neon Postgres project and copy its connection string as `DATABASE_URL`.

## 1. Vercel

Import the `Watchman` repository and set:

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root Directory | `apps/web` |
| Install Command | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm --filter @watchman/web build` |

Add `DATABASE_URL`. Leave `PRIVATE_KEY` unset for the recommended judge/demo setup. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is optional.

The live judge path is:

1. Open https://watchman-beta.vercel.app/
2. Go to **Protect**.
3. Use the default **BTC / 1 hour / Demo mode**.
4. Review the live quote and the actual liquidity constraint.
5. Click **Protect Position**.
6. Open **Hedges** and then the receipt.

## 2. Railway

Deploy the repository as an always-on service using the root `railway.json` configuration.

The service should use:

- Build: `pnpm --filter @watchman/agent build`
- Pre-deploy: `pnpm --filter @watchman/db exec prisma migrate deploy`
- Start: `pnpm --filter @watchman/agent start`

Add the same `DATABASE_URL`. `PRIVATE_KEY` is optional and controls whether live testnet orders can execute.

Do not turn the agent into a cron job. It must remain running so live hedges can be reconciled and receipts generated after real market settlement.

## 3. Verify

After deployment:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For the Vercel Prisma deployment, confirm the query engine is traced into the protect route:

```bash
cd apps/web && pnpm build
grep -c libquery_engine .next/server/app/api/protect/route.js.nft.json
```

A result of `1` or more confirms the native Prisma engine is included.

## Demo mode

Demo mode is the recommended submission path. It uses the live DreamDEX quoting and sizing logic, records a simulated hedge, and creates a clearly labelled computed demo receipt using the existing effectiveness engine. It does not place an on-chain order, fabricate a transaction hash, or claim an on-chain settlement.

The demo receipt uses a visible `-3.00%` scenario so judges can inspect the complete attribution flow without waiting for a market to resolve.

## Real execution (optional)

For live testnet execution, configure a dedicated funded test wallet and set `PRIVATE_KEY` in both Vercel and Railway. Watchman still re-checks the market on-chain immediately before sending an order and preserves the existing persist-before-execute, idempotency, reconciliation, and redemption safeguards.

## Troubleshooting

- **Quotes do not populate:** DreamDEX/Somnia may be temporarily unreachable from the deployment region. Retry and check the quote error state.
- **Hedges have no receipts in live mode:** confirm the Railway worker is running and both services use the same `DATABASE_URL`.
- **A hedge is stuck in `EXECUTING`:** do not clear it manually. The worker reconciles the row against the chain and only changes it when the outcome is determinable.
- **Prisma query engine error on Vercel:** rebuild and confirm `libquery_engine` appears in the route's NFT trace as shown above.
- **Faucet disabled in production:** expected. Watchman does not operate a production faucet; use the supported Somnia testnet funding route before enabling live execution.
