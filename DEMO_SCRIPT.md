# Demo video (75 seconds)

Story: **Intent → Permission → Protection → Execution → Proof.**

Record https://watchman-beta.vercel.app in a fresh browser window at 1280×800 (or a phone). Demo mode needs no wallet. Start on the empty Create screen.

| Time | Screen | Do | Say |
|---|---|---|---|
| 0:00 | Create | Type *If ETH drops 10%, sell 25% of my ETH to USDC.* | "I want to protect my ETH while I'm away, without handing an AI my keys." |
| 0:08 | Create | Click **Create Protection** | "Watchman compiles that sentence into a fixed policy. No model in the loop: anything outside one ETH exit is rejected." |
| 0:14 | Confirm | Pause on WHEN / THEN / TO / ON | "This is exactly what it will do. Nothing is live yet." Click **Arm Protection**. |
| 0:20 | Permission | Let the CAN / CANNOT columns sit for two seconds | "Here's the point. Watchman can sell up to 25% of my ETH for USDC on Base, only on a 10% drop. It can't buy, transfer, raise its limit, or touch my key. PayBox holds that authority." |
| 0:32 | Permission | Click **Grant Permission** | "PayBox grants Watchman this one action, revocable anytime." |
| 0:36 | Monitoring | Point at reference, trigger, distance | "Now it watches. Reference captured, trigger set. I can walk away." |
| 0:42 | Monitoring | Click **Simulate market drop** | "Let's crash the market." |
| 0:48 | Triggered | Let the steps advance | "ETH crossed the trigger. Watchman asks PayBox for the one swap the policy allows. PayBox signs it inside its own custody." |
| 0:58 | Complete | Scroll the receipt and audit trail | "Executed and verified: ETH sold, USDC received, execution price, and every step on the record. Watchman never claims success until it's verified." |
| 1:08 | Complete | End on the receipt | "Watchman protects. PayBox authorizes. You stay in control." |

Notes

- If ETH is already near the trigger, nothing happens until you click **Simulate market drop**; the simulated market only drifts within about 1% otherwise.
- The **Demo** pill in the header is intentional. Say it if asked: the demo uses the same engine and screens as live, with a simulated market and simulated PayBox settlement, and never shows a fake transaction hash.
- Optional 10-second cut: show the plugin in PayBox calling `compile_protection` on the same sentence.
