# Watchman

**Protect your position while you're away.**

You tell Watchman one rule: *"If ETH drops 10%, sell 25% of my ETH to USDC."* Watchman compiles it into a fixed policy and shows exactly what it can and cannot do. You grant it that one authority through PayBox. Then it watches. When ETH crosses the trigger, Watchman asks PayBox for the one swap the policy allows, follows the request to settlement, verifies the result on Base, and gives you a receipt with a full audit trail.

Watchman never holds your private key. PayBox does, and PayBox enforces the grant.

Live: https://watchman-beta.vercel.app

## Why PayBox

Without PayBox, an automated stop-loss needs your private key, unrestricted wallet access, or your approval every time. PayBox is the middle ground: a revocable grant on one wallet, checked by PayBox on every request, signed inside PayBox's MPC custody. Watchman is the protection layer. PayBox is the authority layer.

## How it works

```
Coinbase + Kraken ──► Watchman trigger rule ──► (only then) PayBox requestSwap ──► Base receipt check ──► receipt
   price feed           fresh, corroborated,       ETH → USDC, exact amount,          USDC really arrived,
                        at or below trigger         one request, ever                 within the authority
```

| Piece | Where | What it does |
|---|---|---|
| `packages/core` | shared | Policy grammar, integer money math, trigger rule, the execution state machine, PayBox and Base adapters, demo adapters |
| `packages/db` | shared | Prisma schema and the Postgres store (guarded conditional updates) |
| `apps/web` | Vercel | The six-screen flow and its API |
| `apps/agent` | Railway | The monitor. Owns the price condition; contacts PayBox only for a crossed trigger |
| `plugin` | PayBox | The Watchman PayBox plugin (MCP), built from the same core |

## Safety model

- **The policy is a grammar, not a model.** One asset, one trigger, one action. Anything else is rejected with the reason. Any word the grammar doesn't understand fails the compile, so "...to USDC and send it to 0x..." can never compile into something that ignores its second half.
- **Armed means frozen.** Reference price, trigger and maximum sell amount are derived once, at arming, by a guarded `DRAFT → ARMED` transition. No path writes them again.
- **Every PayBox parameter comes from the policy.** Chain `eip155:8453`, `native` → USDC, `exact-amount-in`, amount = policy share of the current balance, never above the armed ceiling.
- **Stale data can't sell.** The trigger acts only on a fresh price, after sanity bounds, using the *highest* answering source, and pauses when Coinbase and Kraken disagree by more than 1.5%. The PayBox grant is re-checked at the moment of triggering.
- **Exactly one request.** Each step is a conditional `UPDATE ... WHERE <previous state>`. Only the caller that wins the submission claim calls PayBox. A submission whose outcome is unknown is held for review and never resubmitted. Tested with 20 concurrent workers against Postgres.
- **The request ID is never lost.** The SDK call that creates the swap also signs it; Watchman captures the request ID the instant PayBox returns it, so a failure later in that call still leaves Watchman following the same request.
- **Success means verified.** PayBox `success` moves the protection to `VERIFYING`. It completes only after Watchman reads the receipt on Base: status succeeded, USDC transferred to the wallet, ETH sold within the authority. Otherwise it fails or stops for review, saying whether funds moved.
- **Honest states.** `pending_approval`, `pending_signature`, `pending_funding`, `pending_settlement` and `pending_confirmation` each surface as what they are. If PayBox needs your passkey or a signature, the screen says so.

## Demo mode

Demo mode is the same product on simulated rails: a deterministic simulated market and a simulated PayBox with PayBox's real request lifecycle (`pending_signature → pending_confirmation → success`). The engine, state machine and screens are identical. A simulated swap never shows a transaction hash; the receipt says *Simulated · no on-chain transaction*.

Live mode needs PayBox configured on the server and a browser unlocked at `/operator`. See [DEPLOY.md](DEPLOY.md).

## Develop

```bash
pnpm install
cp .env.example .env            # set DATABASE_URL
pnpm db:migrate:deploy
pnpm dev:web                    # http://localhost:3000, demo mode
pnpm dev:agent                  # live monitor (needs PAYBOX_API_KEY for live)
```

```bash
pnpm typecheck
pnpm test                       # 105 core tests; Postgres tests run with TEST_DATABASE_URL
pnpm build
```

The plugin has its own toolchain (Node 24, pnpm 11.11): see [plugin/README.md](plugin/README.md).
