# Deploying Watchman

Three parts share one Neon Postgres database:

- `apps/web` on Vercel (the product)
- `apps/agent` on Railway (the live monitor)
- `plugin/` uploaded to the PayBox developer portal (the hackathon entry)

## 1. Database

Use the existing Neon `DATABASE_URL`. The migration `20261017140000_paybox_protection` drops the old DreamDEX tables and creates `Protection`, `AuditEvent` and `MonitorHeartbeat`. It runs automatically as Railway's pre-deploy step, or by hand:

```bash
DATABASE_URL=... pnpm db:migrate:deploy
```

## 2. Vercel (apps/web)

Keep the existing project settings (root `apps/web`, `pnpm install --frozen-lockfile`, `pnpm --filter @watchman/web build`).

| Variable | Demo only | Live |
|---|---|---|
| `DATABASE_URL` | required | required |
| `PAYBOX_API_KEY` | unset | the Watchman agent key |
| `WATCHMAN_OPERATOR_KEY` | unset | a long random string |

Do **not** put `PAYBOX_SIGNING_KEY` on Vercel. The web app only lists grants, checks readiness and arms; it never signs.

## 3. Railway (apps/agent)

`railway.json` already configures build, pre-deploy migration and start. Set `DATABASE_URL`, and for live execution `PAYBOX_API_KEY` and `PAYBOX_SIGNING_KEY`. Keep it always-on: it is the monitor.

The UI shows **Monitoring interrupted** whenever the monitor's heartbeat is older than 60 seconds, so a stopped worker is never silent.

## 4. PayBox setup for live mode

1. In the PayBox app, create an agent for Watchman and grant it **one Base wallet**. Choose the approval mode you want: *autonomous* lets PayBox clear the swap within the grant; any other mode means PayBox asks for your passkey when the protection triggers, and Watchman shows that state.
2. Copy its `pbx_live_...` key into `PAYBOX_API_KEY`.
3. On any machine: `npx @paybox-sh/sdk login --key pbx_live_...` then `npx @paybox-sh/sdk connect`, and approve the emoji code in PayBox. Copy the paired `signingKey` from `~/.config/paybox/config.json` into Railway's `PAYBOX_SIGNING_KEY`. The key and signer are a matched pair; re-pair if you rotate the API key.
4. Fund the wallet with ETH on Base.
5. Open `/operator` on the site, enter `WATCHMAN_OPERATOR_KEY`. The header switches to **Live · Base**. Create, confirm and grant as usual. Watchman confirms the grant with PayBox, reads the Base balance, runs PayBox's readiness check and captures a corroborated reference price before arming.

## 5. PayBox plugin (hackathon entry)

```bash
cd plugin
pnpm install --frozen-lockfile   # Node 24, pnpm 11.11.0
pnpm test                        # typecheck, two identical builds, official conformance
```

Upload `plugin/dist/plugin.mjs` in the developer portal. Under **Test & configure → network hosts** add:

- `api.coinbase.com`
- `api.kraken.com`
- `watchman-beta.vercel.app`

No secrets are needed. Optionally set the variable `WATCHMAN_URL` if the site moves. Run the hosted checks, accept the terms and select **Submit Project** before 8:00 PM ET on Saturday, October 17.

## Verify

```bash
pnpm typecheck && pnpm test && pnpm build
cd apps/web && grep -c libquery_engine .next/server/app/api/protection/route.js.nft.json   # ≥ 1: Prisma engine traced
```

## Troubleshooting

- **"Watchman doesn't have access to a wallet yet"**: the agent key has no wallet grant. Use the *Open PayBox* link, grant a Base wallet, then *check again*.
- **Stuck on "Signature required to continue"**: the monitor has no `PAYBOX_SIGNING_KEY`, or the signer belongs to a different client. Finish the swap in PayBox; Watchman keeps following the same request and never signs twice.
- **"Stopped for review"**: Watchman couldn't prove what happened (an unconfirmed submission, or a confirmed transaction it couldn't verify). It will not act again on that protection. Check PayBox activity and Basescan.
