import { describe, expect, it } from "vitest";
import { describeTerms, maxSellFor, parseInstruction, sellAmountFor, triggerPriceFor } from "../src/policy.js";

const ok = (text: string) => {
  const r = parseInstruction(text);
  if (!r.ok) throw new Error(`expected ok for "${text}", got ${r.code}: ${r.message}`);
  return r.terms;
};
const code = (text: string) => {
  const r = parseInstruction(text);
  if (r.ok) throw new Error(`expected failure for "${text}"`);
  return r.code;
};

describe("parseInstruction: supported", () => {
  it("compiles the canonical instruction", () => {
    expect(ok("If ETH drops 10%, sell 25% of my ETH to USDC.")).toEqual({ asset: "ETH", destinationAsset: "USDC", chain: "base", dropBps: 1000, sellBps: 2500 });
  });

  it.each([
    "If ETH drops 10%, sell 25% to USDC.",
    "if eth falls 10% sell 25% of my eth for usdc",
    "When ETH declines by 10 percent, then sell 25% of my ETH into USDC",
    "Sell 25% of my ETH to USDC if ETH drops 10%",
    "If ETH drops 10% from here, sell 25% of my ETH to USDC",
    "If the price of ETH falls 10% or more, swap 25% of my ETH to USDC",
    "If ETH’s price drops 10%, sell 25% of my position to USDC!",
  ])("accepts phrasing: %s", (text) => {
    expect(ok(text)).toMatchObject({ dropBps: 1000, sellBps: 2500 });
  });

  it("accepts up to two decimals", () => {
    expect(ok("If ETH drops 12.5%, sell 33.33% of my ETH to USDC")).toMatchObject({ dropBps: 1250, sellBps: 3333 });
  });

  it("is deterministic", () => {
    const text = "If ETH drops 7%, sell 40% of my ETH to USDC.";
    expect(parseInstruction(text)).toEqual(parseInstruction(text));
  });

  it("round-trips through describeTerms", () => {
    const terms = ok("If ETH drops 12.5%, sell 25% of my ETH to USDC");
    expect(ok(describeTerms(terms))).toEqual(terms);
  });
});

describe("parseInstruction: rejected", () => {
  it("rejects empty input", () => expect(code("   ")).toBe("empty"));

  it("rejects vague intent with the supported-shape message", () => {
    const r = parseInstruction("If ETH gets volatile, rebalance my portfolio.");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Watchman currently protects ETH with a percentage-drop exit only.");
  });

  it.each([
    ["If BTC drops 10%, sell 25% of my BTC to USDC", "unsupported_asset"],
    ["If SOL drops 10%, sell 25% to USDC", "unsupported_asset"],
    ["If ETH drops 10%, sell 25% of my ETH to USDT", "unsupported_destination"],
    ["If ETH drops 10%, sell 25% of my ETH to DAI", "unsupported_destination"],
    ["If ETH rises 10%, sell 25% of my ETH to USDC", "unsupported_direction"],
    ["If ETH drops 10%, buy 25% more ETH", "unsupported_action"],
    ["If ETH drops 10%, transfer my ETH to 0xabc", "unsupported_action"],
    ["If ETH drops 10%, sell 25% of my ETH to USDC and send it to 0x1234", "unsupported_action"],
    ["If ETH drops 10%, sell 25% of my ETH to USDC on Arbitrum", "unrecognized"],
    ["If ETH drops 10, sell 25 of my ETH to USDC", "missing_percent"],
  ])("%s → %s", (text, expected) => expect(code(text)).toBe(expected));

  it.each([
    "If ETH drops -10%, sell 25% of my ETH to USDC",
    "If ETH drops 1o%, sell 25% of my ETH to USDC",
    "If ETH drops 10.555%, sell 25% of my ETH to USDC",
    "If ETH drops 1,0%, sell 25% of my ETH to USDC",
  ])("rejects malformed percentage: %s", (text) => expect(code(text)).toBe("malformed_percent"));

  it("rejects a doubled percent sign", () => expect(code("If ETH drops 10%%, sell 25% of my ETH to USDC")).toBe("unrecognized"));

  it.each([
    ["If ETH drops 0%, sell 25% of my ETH to USDC", "drop_out_of_range"],
    ["If ETH drops 0.5%, sell 25% of my ETH to USDC", "drop_out_of_range"],
    ["If ETH drops 60%, sell 25% of my ETH to USDC", "drop_out_of_range"],
    ["If ETH drops 10%, sell 0% of my ETH to USDC", "sell_out_of_range"],
    ["If ETH drops 10%, sell 100% of my ETH to USDC", "sell_out_of_range"],
    ["If ETH drops 10%, sell 250% of my ETH to USDC", "sell_out_of_range"],
  ])("%s → %s", (text, expected) => expect(code(text)).toBe(expected));

  it("rejects very long input", () => expect(code(`If ETH drops 10%, sell 25% of my ETH to USDC ${"please ".repeat(40)}`)).toBe("too_long"));
});

describe("derived terms", () => {
  it("trigger = reference × (1 − drop)", () => {
    expect(triggerPriceFor(400_000, 1000)).toBe(360_000);
    expect(triggerPriceFor(384_217, 1000)).toBe(345_795); // floors 345795.3
    expect(triggerPriceFor(400_000, 1250)).toBe(350_000);
  });

  it("rejects an invalid reference price", () => {
    expect(() => triggerPriceFor(0, 1000)).toThrow();
    expect(() => triggerPriceFor(12.5, 1000)).toThrow();
  });

  it("25% means exactly 25%", () => {
    expect(maxSellFor(2_000_000_000_000_000_000n, 2500)).toBe(500_000_000_000_000_000n);
    expect(maxSellFor(3n, 2500)).toBe(0n); // floors, never rounds up
    expect(maxSellFor(1_000_000_000_000_000_003n, 2500)).toBe(250_000_000_000_000_000n);
  });

  it("never sells more than the ceiling fixed at arming", () => {
    const max = maxSellFor(2_000_000_000_000_000_000n, 2500);
    // Balance grew after arming: still capped at the armed maximum.
    expect(sellAmountFor(10_000_000_000_000_000_000n, 2500, max)).toBe(max);
    // Balance shrank: sells 25% of what is there now, which is less.
    expect(sellAmountFor(1_000_000_000_000_000_000n, 2500, max)).toBe(250_000_000_000_000_000n);
    expect(sellAmountFor(0n, 2500, max)).toBe(0n);
  });
});
