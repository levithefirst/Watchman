# Demo video script (2–3 minutes)

Record the canonical live deployment at https://watchman-beta.vercel.app/. Timings are approximate. Bracketed lines are screen actions, not speech. Do not wait for a live market to resolve. The demo receipt is already computed when the simulated hedge is created.

---

**[0:00 – 0:15] — Landing page**

[Show the hero and the Watchman positioning.]

> "Watchman is portfolio insurance for DreamDEX Event Contracts. It answers the question most hedge interfaces don't: after I pay for protection, how much downside did I actually remove?"

**[0:15 – 0:45] — Open Protect**

[Click Protect. Confirm Demo mode, BTC, $10,000 exposure, 50% protection, and 1 hour.]

> "The default demo is a ten-thousand-dollar BTC position with fifty percent protection over the next hour. Watchman is now quoting the live Down market on DreamDEX."

[Pause on the quote price, contracts, premium, and Protection capacity panel.]

> "The important part is the capacity check. Watchman does not pretend the requested five thousand dollars of protection is executable when the book cannot fill it. It shows the amount currently obtainable, the fill percentage, and whether liquidity or budget is the binding constraint."

[Point at the liquidity-limited message if it is shown.]

> "That constraint is intentional. The system is telling me what I can actually buy, not what I wish the market could fill."

**[0:45 – 1:15] — Create the demo hedge**

[Click Protect Position. Show the Simulated order badge and click View hedge.]

> "I'll protect the position. This is Demo mode, so no on-chain order is sent. The real quote and sizing result are recorded as a simulated hedge, and the demo receipt uses the same effectiveness engine as live settlements."

[Show the hedge detail page. Pause on exposure, filled contracts, premium, and the proof panel.]

> "Notice the proof section. There is no fabricated transaction hash and no claim that this settled on-chain. The hedge is explicitly simulated."

**[1:15 – 2:15] — Open the receipt**

[Click Open full receipt.]

> "Now we get to the part Watchman is built around: attribution. The receipt shows what I had, what I paid, what happened, what the hedge returned, and what remained."

[Pause on each number as it is named.]

> "Here is the exposure. Here is the premium. The demo scenario applies a three percent downside move. Here is the unhedged P&L, the hedge payout, and the resulting hedged P&L."

[Point at Loss offset.]

> "Then Watchman answers the real risk question: how much of the loss did the hedge actually offset? Loss offset is the realised loss covered by the payout, capped at one hundred percent."

[Point at Net hedge contribution.]

> "Net hedge contribution is separate. That's the payout minus the premium, so it tells me what the hedge added economically. If the payout exceeds the loss, the receipt can also show overshoot. That's basis risk from the binary contract, not extra protection."

**[2:15 – 2:45] — Close**

[Hold on the receipt.]

> "The point is simple. The important number is not that the hedge existed. It is how much of the actual loss it offset. Watchman turns a binary Event Contract into a measurable protection position: what I had, what I paid, what the hedge returned, and how much downside it actually removed."

---

## Recording checklist

- Use https://watchman-beta.vercel.app/
- Start from the landing page.
- Open **Protect**.
- Leave the default at **BTC / 1 hour / Demo mode**.
- Let the live quote load before recording the quote section.
- Show the **Protection capacity** block and its actual fillable amount.
- Click **Protect Position**.
- Open the created hedge.
- Show the simulated proof state with no transaction hash.
- Open the full receipt.
- Hold long enough for judges to read exposure, premium, move, payout, unhedged P&L, hedged P&L, loss offset, net hedge contribution, and overshoot if present.
- Do not describe the demo scenario as a live settlement.
- Keep the final recording below 3 minutes.
