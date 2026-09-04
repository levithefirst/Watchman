# Deploying Watchman (zero to live in under 10 minutes)

> **Current production deployment:** https://watchman-beta.vercel.app
>
> The Vercel project is already linked to `levithefirst/Watchman` and auto-deploys
> from `main` (Vercel records the URL in the GitHub repo's homepage field). The
> steps below are for provisioning a *new* environment from scratch; if you are
> just shipping changes, pushing to `main` is all that is required.

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
   | **Build Command** | leave as-is — `apps/web/vercel.json` sets it to `pnpm --filter @watchman/web build` automatically |
   | **Output Directory** | leave at the default (`.next`) |

   You should not need to type anything into the Build/Install Command boxes — the repo's `apps/web/vercel.json` configures them for you the moment Vercel detects Root Directory `apps/web`. If you ever do need to set them by hand (e.g. Vercel's UI insists on a value), use exactly:
   ```
   Install Command: pnpm install --frozen-lockfile
   Build Command:   pnpm --filter @watchman/web build
   ```
   **Important:** if your Vercel project already has a *different* Build or Install Command saved from an earlier attempt, delete it (leave the field blank / toggle "Override" off) rather than pasting the one above over it — a saved override always wins over `vercel.json`, so the old broken value would keep taking effect otherwise.
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the connection string you copied from Neon |
   | `PRIVATE_KEY` | *(leave empty for the recommended zero-funding demo setup — see note below)* |
   | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | *(optional — see note below)* |

5. Click **Deploy**. Wait ~2 minutes for the build to finish.
6. Once it's live, open the deployment URL and confirm the landing page loads with a **"Try Demo"** button.

> **About `PRIVATE_KEY` on Vercel:** leaving it unset is the recommended setup for a public demo. Judges get the full quote → hedge → receipt flow with a clear "Simulated order" badge and nothing to fund. Only set it if you specifically want visitors to place real testnet orders — see [Real execution (optional)](#real-execution-optional) below.
>
> **About `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`:** the **Connect wallet** button on `/protect` opens a picker (MetaMask, Rabby, Coinbase, OKX, Trust, Brave, WalletConnect, and any other browser-injected wallet). Leaving this unset still lists and connects every browser-extension wallet — only the WalletConnect QR-code/deep-link path, which is what lets most *mobile* wallet apps pair with a normal mobile browser tab, is disabled until you set it. Get a free id at [cloud.reown.com](https://cloud.reown.com) and paste it in — it's a public app identifier, not a secret.
>
> **Why this used to fail:** `packages/db` and `packages/sdk` are internal workspace packages. The first fix attempt made `apps/web` build them to `dist/` before its own build — correct in theory, but it only worked if Vercel actually ran that exact multi-step command, which depended on dashboard state we couldn't verify. The real fix removes that dependency entirely: `packages/db` and `packages/sdk` now ship their TypeScript **source** directly (`package.json` "main"/"exports" point at `src/index.ts`, no build step, no `dist/` at all), and `apps/web/next.config.ts` sets `transpilePackages: ["@watchman/sdk", "@watchman/db"]` plus a small webpack `resolve.extensionAlias` tweak so Next compiles that source in-place as part of the single `next build`. There is no longer a "build the workspace packages first" step to get wrong or skip.

---

## 2. Deploy the settlement worker to Railway (3 minutes)

The website alone can create hedges, but something needs to keep checking whether they've settled — that's this worker. Without it, hedges will sit open and receipts will never be generated.

1. Go to [railway.app](https://railway.app) and sign in with the same GitHub account.
2. Click **New Project → Deploy from GitHub repo**, then select the `Watchman` repo.
3. Railway creates one service from the repo — the repo's root-level `railway.json` configures its build and start commands automatically. Click into the service, go to **Settings**, and confirm (you shouldn't need to change anything):

   | Setting | Value |
   |---|---|
   | **Root Directory** | leave at the default (the repository root) — do **not** set this to `apps/agent` |
   | **Build Command** | from `railway.json`: `pnpm --filter @watchman/agent build` |
   | **Pre-Deploy Command** | from `railway.json`: `pnpm --filter @watchman/db exec prisma migrate deploy` — **required**, see the warning below |
   | **Start Command** | from `railway.json`: `pnpm --filter @watchman/agent start` — runs the agent directly via `tsx` (no separate compile step) |
   | **Deploy type** | a normal always-on service (Railway's default) — **not** a cron/scheduled job. This loop must run continuously to settle hedges. |

   > **Do not clear the Pre-Deploy Command.** It is what applies the Prisma migrations to the production database on every deploy. Without it the agent starts, connects, and then fails every poll with `The table 'public.Hedge' does not exist in the current database` — hedges never settle and no receipt is ever written. `railway.json` now carries this command too, so a service created fresh from the repo gets it automatically; if Settings shows it blank on an existing service, paste the value above in manually.

   If any other setting shows a leftover value from an earlier attempt that contradicts the table above, replace it with the value shown here.
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

## 3. Apply the database schema (automatic)

The database Neon created is empty — it needs the `User`, `Exposure`, `Hedge`, `Receipt`, and `Policy` tables. **This happens automatically**: the Railway service's Pre-Deploy Command runs `prisma migrate deploy` before the agent starts, on every deploy. Confirm it worked in the Railway **Logs** tab — a healthy first deploy shows:

```
1 migration found in prisma/migrations
Applying migration `20260903000000_init`
All migrations have been successfully applied.
```

If you ever need to apply migrations by hand (e.g. you're not using Railway), run this once from your own computer with `DATABASE_URL` pointed at the same Neon database:

```bash
git clone <your fork/repo URL>
cd Watchman
pnpm install
DATABASE_URL="<paste your Neon connection string>" pnpm db:migrate:deploy
```

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

- **`Module not found: Can't resolve '@watchman/sdk'` or `'@watchman/db'`** — these packages no longer need a build step (they ship TypeScript source directly, transpiled in-place by Next), so this specific error should not recur. If it does, your Vercel project almost certainly has an old Build or Install Command saved in **Project Settings → Build & Deployment** from before this fix — clear it (or overwrite it with the exact values in step 1 above) so `apps/web/vercel.json` takes effect, then redeploy. A saved dashboard value always wins over `vercel.json`.
- **Railway build fails / "Failed to build an image"** — same root cause as above. Check **Settings** on the service and make the Build/Start commands match the table in step 2. Do not blanket-clear the Settings fields: the **Pre-Deploy Command** must survive, or migrations stop running (see next item).
- **Agent logs `The table 'public.Hedge' does not exist in the current database`** — the Prisma migrations never ran against this database. The **Pre-Deploy Command** (`pnpm --filter @watchman/db exec prisma migrate deploy`) is missing or was cleared from the Railway service. Restore it per step 2 and redeploy; a healthy deploy logs `All migrations have been successfully applied.` before the agent's startup banner.
- **Vercel build fails on a Prisma-related TypeScript error** (e.g. "Cannot find module '@prisma/client'") — `packages/db`'s `postinstall` script runs `prisma generate` automatically during `pnpm install`; this doesn't require `DATABASE_URL` to be set or reachable, only that `pnpm install` actually ran (i.e. the Install Command wasn't skipped or overridden).
- **Site loads but quotes never populate** — this is independent of your database; it means DreamDEX/Somnia's public endpoints are unreachable from Vercel's region, or the network is temporarily down. Retry after a minute.
- **Hedges never get a receipt** — the Railway worker isn't running, crashed, or has a different `DATABASE_URL` than Vercel. Check the Railway logs.
- **"disabled in production" error on the faucet button** — expected behavior, see the `PRIVATE_KEY` note above.
