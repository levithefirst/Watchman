# Watchman PayBox plugin

Watchman's protective exit as a PayBox plugin: compile one rule, watch its trigger, and when the trigger has really crossed, hand the agent the exact `request_swap` PayBox should run. The plugin never arms, signs or submits anything. PayBox keeps the wallet, the grant and the approval.

The policy grammar and trigger rule are bundled from `../packages/core`, the same code the Watchman app and monitor run.

| Tool | Network | What it returns |
|---|---|---|
| `compile_protection` | none | The fixed policy, what Watchman can and cannot do, and a link where the user reviews and arms it. Rejects anything outside one ETH percentage-drop exit to USDC. |
| `check_eth_trigger` | Coinbase, Kraken | `hold`, `trigger` or `pause` (stale, missing or disputed price) for a reference price and drop. |
| `plan_protective_exit` | Coinbase, Kraken | Only on a crossed trigger: the `request_swap` arguments (native ETH → USDC on Base, exact amount in, capped at the authority). Otherwise `ready: false` and why. |
| `get_protection_status` | Watchman | One protection's status, prices and verified receipt. |

## Build and check

Requires Node.js 24 and pnpm 11.11.0 (starter 1.0.2 toolchain).

```bash
pnpm install --frozen-lockfile
pnpm test        # typecheck, build twice (must be byte-identical), official conformance
```

Upload `dist/plugin.mjs`. Network hosts: `api.coinbase.com`, `api.kraken.com`, `watchman-beta.vercel.app`. Optional variable: `WATCHMAN_URL`.

The `scripts/` folder, `src/paybox.ts`, `tsconfig.json`, `pnpm-workspace.yaml` and `starter-version.json` are the unmodified PayBox plugin starter v1.0.2.
