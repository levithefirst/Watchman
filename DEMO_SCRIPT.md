# Demo video script (60–90 seconds)

Read this while screen-recording the live Vercel deployment. Timings are approximate — pause naturally, don't rush the numbers. Bracketed lines are actions, not speech.

---

**[0:00 – 0:10] — Landing page**

> "Holding crypto through a volatile window means picking between selling your position, or riding out the drawdown. Watchman turns short-duration Event Contracts on DreamDEX into portfolio insurance instead — you keep the position, and Watchman hedges the downside for you."

**[0:10 – 0:15] — Click "Try Demo — $10k BTC, 50%, 15m"**

> "One click — no wallet, no funding — drops me straight into a real scenario: ten thousand dollars of BTC, fifty percent protection, for the next fifteen minutes."

**[0:15 – 0:35] — Point at the live quote panel**

> "This quote is live — it's pulling the actual cheapest Down contract on DreamDEX right now: the price, how many contracts, the premium, and the potential payout. And right here —" *(point at the badge)* "— it tells me straight up this is a simulated order, so I know exactly what I'm looking at before I click anything."

**[0:35 – 0:45] — Click "Protect Position"**

> "I'll protect the position. Watchman sizes the hedge against my premium budget and creates it."

**[0:45 – 1:00] — Open the hedge / /hedges page**

> "Every hedge Watchman opens is tracked here — exposure, protection, premium, expiry — until the market resolves."

**[1:00 – 1:20] — Open the Hedge Receipt**

> "And once the window closes, this is the payoff: the Hedge Receipt. One sentence tells me exactly what happened — how far the market actually moved, and what the hedge paid out. Below that: unhedged loss versus hedged loss, net protection, and efficiency. No hand-waving about basis risk — the gap between a perfect put and a binary contract is right there in the numbers."

**[1:20 – 1:30] — Close**

> "That's the whole loop — quote, hedge, settle, receipt — running end to end on real DreamDEX markets. That's Watchman."

---

## Notes for recording

- If the 15-minute window hasn't resolved yet by recording time, either: (a) pre-create a hedge earlier and have its receipt ready to open at the 1:00 mark, or (b) cut from "Protect Position" straight to a previously-generated receipt and say "and here's one from earlier today" instead of waiting live.
- Keep the mouse deliberate — pause on the quote numbers and the receipt numbers for at least a full second each so viewers can actually read them.
- If recording with `PRIVATE_KEY` configured and a funded wallet, you can swap step 3 to show the "Live testnet execution" badge and a real transaction link instead — adjust the line at 0:15–0:35 to say "and this one's a real testnet order" instead of "simulated."
