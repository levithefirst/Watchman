# Submission text

## Name

Watchman

## Tagline

Protect your position while you're away. One scoped exit rule, enforced by PayBox, without ever touching your keys.

## Description

Everyone knows they should protect a position. Nobody wants to watch charts all day, hand a bot their private key, or approve every move by hand.

Watchman turns one sentence, "If ETH drops 10%, sell 25% of my ETH to USDC", into a fixed, deterministic policy and shows exactly what it can and cannot do. The user grants that single authority through PayBox. Watchman watches ETH on Coinbase and Kraken, and only when the trigger really crosses does it ask PayBox for the one swap the policy allows: native ETH to USDC on Base, exact amount, never above the limit fixed at arming. It follows the PayBox request to settlement, verifies the transaction on Base, and hands back a receipt with a full audit trail.

PayBox is why this can exist. Without it, automation means private keys, unrestricted access, or approving every action. With PayBox, the wallet key stays in PayBox's custody, the grant is revocable, and PayBox checks every request against it. Watchman is the protection layer; PayBox is the authority layer.

Built to be trusted with money:

- The policy is a strict grammar, not an LLM. Unsupported instructions are rejected with the reason.
- An armed policy is frozen. Every PayBox parameter is derived from it.
- Stale, missing or disputed prices pause the protection instead of selling.
- Exactly one PayBox request per trigger, enforced by guarded database transitions and tested with 20 concurrent workers. Unknown outcomes are held for review, never resubmitted.
- Nothing is called complete until Watchman verifies the Base receipt: transaction succeeded, USDC arrived, ETH sold within the authority.
- Every PayBox state, from passkey approval to pending signature to funding, is shown honestly.

The Watchman PayBox plugin brings the same policy engine to any PayBox agent: compile a protection, check its trigger, and on a crossed trigger get the exact `request_swap` to run. It never arms or executes anything itself.

## Links

- App: https://watchman-beta.vercel.app
- Code: https://github.com/levithefirst/Watchman
- Demo video: (add the X post URL)
