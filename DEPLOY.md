# Deploying Watchman (zero to live in under 10 minutes)

Watchman is two services sharing one database:

- **apps/web** (Vercel) — the website judges use.
- **apps/agent** (Railway) — a background worker that settles hedges and redeems positions. It has no UI; it just needs to keep running.

You'll set up the database first, then each service. No coding required — just copy-pasting values into two dashboards.

---

## 0. Create the database (2 minutes)

1. Go to [neon.tech](https://neon.tech) and sign up (free tier is enough).
2. Click **Create a project**. Any name/region is fine.
3. On the project dashboard, find the **Connection string** box. Copy the string that starts with `postgresql://` — this is your `DATABASE_URL`. Keep this tab open, you'll need it twice.

---

## 1. Deploy the website to Vercel (4 minutes)

1. Go to [vercel.com](https://vercel.com) and sign in with the GitHub account that has this repo.
2. Click **Add New… → Project**, then select the `Watchman` repo and click **Import**.
3. On the "Configure Project" screen, set exactly these values:

   | Setting | Value |
   |---|---|
   | **Framework Preset** | Next.js *(auto-detected)* |
   | **Root Directory** | `apps/web` — click **Edit** next to it to set this |
   | **Install Command** | leave as-is — `apps/web/vercel.json` in the repo sets it to `pnpm install --frozen-lockfile` automatically |
   | **Build Command** | leave as-is — `apps/web/vercel.json` sets it to build `@watchman/db` and `@watchman/sdk` before `@watchman/web` automatically |
   | **Output Directory** | leave at the default (`.next`) |

   You should not need to type anything into the Build/Install Command boxes — the repo's `apps/web/vercel.json` configures them for you the moment Vercel detects Root Directory `apps/web`. If you ever do need to set them by hand (e.g. Vercel's UI insists on a value), use:
   ```
   Install Command: pnpm install --frozen-lockfile
   Build Command:   pnpm --filter @watchman/db generate && pnpm --filter @watchman/db build && pnpm --filter @watchman/sdk build && pnpm --filter @watchman/web build
   ```
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the connection string you copied from Neon |
   | `PRIVATE_KEY` | *(leave empty for the recommended zero-funding demo setup — see note below)* |

5. Click **Deploy**. Wait ~2 minutes for the build to finish.
6. Once it's live, open the deployment URL and confirm the landing page loads with a **"Try Demo"** button.

> **About `PRIVATE_KEY` on Vercel:** leaving it unset is the recommended setup for a public demo. Judges get the full quote → hedge → receipt flow with a clear "Simulated order" badge and nothing to fund. Only set it if you specifically want visitors to place real testnet orders — see [Real execution (optional)](#real-execution-optional) below.
>
> **Why this used to fail:** `packages/db` and `packages/sdk` are internal workspace packages that must be compiled to `dist/` before `@watchman/web` can import them, and Next.js doesn't transpile `node_modules` (which is where pnpm symlinks workspace packages) by default. `apps/web/vercel.json` now guarantees the two packages build first, and `apps/web/next.config.ts` sets `transpilePackages: ["@watchman/sdk", "@watchman/db"]` so Next treats them as first-party source. If you still see `Module not found: Can't resolve '@watchman/sdk'` or `'@watchman/db'`, your Vercel project was configured before this fix — go to **Project Settings → Build & Deployment** and clear any manually-saved Install/Build Command overrides so the repo's `vercel.json` takes effect, then redeploy.

---

## 2. Deploy the settlement worker to Railway (3 minutes)

The website alone can create hedges, but something needs to keep checking whether they've settled — that's this worker. Without it, hedges will sit open and receipts will never be generated.

1. Go to [railway.app](https://railway.app) and sign in with the same GitHub account.
2. Click **New Project → Deploy from GitHub repo**, then select the `Watchman` repo.
3. Railway creates one service from the repo — click into it, then go to **Settings** and set exactly these values:

   | Setting | Value |
   |---|---|
   | **Root Directory** | leave at the default (the repository root) — do **not** set this to `apps/agent`; the build command below needs the full workspace |
   | **Build Command** | `pnpm --filter @watchman/db generate && pnpm --filter @watchman/db build && pnpm --filter @watchman/sdk build && pnpm --filter @watchman/agent build` |
   | **Start Command** | `pnpm --filter @watchman/agent start` |
   | **Deploy type** | a normal always-on service (Railway's default) — **not** a cron/scheduled job. This loop must run continuously to settle hedges. |

4. Go to the **Variables** tab and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the **same** Neon connection string you used on Vercel |
   | `PRIVATE_KEY` | *(same guidance as Vercel — see below)* |
   | `SETTLEMENT_POLL_MS` | `10000` *(optional — this is the default)* |

5. Click **Deploy**. Once it's running, check the **Logs** tab — you should see:
   ```
   Watchman settlement/policy agent started on Somnia Shannon testnet (50312)
   ```

---

## 3. Apply the database schema (1 minute)

The database Neon created is empty — it needs the Watchman tables. Run this once, from your own computer, with `DATABASE_URL` pointed at the same Neon database:

```bash
git clone <your fork/repo URL>
cd Watchman
pnpm install
DATABASE_URL="<paste your Neon connection string>" pnpm db:migrate:deploy
```

This creates the `User`, `Exposure`, `Hedge`, `Receipt`, and `Policy` tables. You only need to do this once per database — re-deploys on Vercel/Railway don't repeat it.

---

## 4. Verify it all works

1. Open your Vercel URL.
2. Click **"Try Demo — $10k BTC, 50%, 15m."**
3. Confirm the quote panel fills in with live numbers and the **"Simulated order"** badge is visible.
4. Click **Protect Position** — you should land on a hedge detail page.
5. Wait for the 15-minute window to close (or come back later), then refresh the hedge page — Railway's worker should have settled it and generated a **Hedge Receipt**.

If step 5 never completes, check the Railway logs for errors and confirm both services have the exact same `DATABASE_URL`.

---

## Real execution (optional)

If you want the deployed site to place real testnet orders instead of simulating them:

1. Create a fresh wallet (never reuse one that holds anything of value) and get its private key.
2. Fund it with testnet STT (for gas) and tUSDC (for collateral) from the Somnia Shannon faucet, or use the in-app faucet button in local development.
3. Add `PRIVATE_KEY=0x...` to **both** Vercel and Railway's environment variables and redeploy both.
4. The in-app dev faucet route is automatically disabled in production, so judges can't drain this wallet through the UI — fund it yourself ahead of time if you want real execution live during judging.

---

## Troubleshooting

- **`Module not found: Can't resolve '@watchman/sdk'` or `'@watchman/db'`** — the workspace packages weren't built before `apps/web` was. This should no longer happen (`apps/web/vercel.json` + `next.config.ts` fix it automatically), but if your Vercel project has a manually-saved Build/Install Command from before this fix, clear it under **Project Settings → Build & Deployment** so `vercel.json` takes effect, then redeploy.
- **Vercel build fails on the Prisma step** — double check the Root Directory is `apps/web` and that you haven't overridden the Build Command with something that skips `pnpm --filter @watchman/db generate`.
- **Site loads but quotes never populate** — this is independent of your database; it means DreamDEX/Somnia's public endpoints are unreachable from Vercel's region, or the network is temporarily down. Retry after a minute.
- **Hedges never get a receipt** — the Railway worker isn't running, crashed, or has a different `DATABASE_URL` than Vercel. Check the Railway logs.
- **"disabled in production" error on the faucet button** — expected behavior, see the `PRIVATE_KEY` note above.
