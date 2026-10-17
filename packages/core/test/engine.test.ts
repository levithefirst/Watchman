import { beforeEach, describe, expect, it } from "vitest";
import { advanceProtection, armProtection, revokeProtection, type EngineDeps } from "../src/engine.js";
import { blankProtection, MemoryStore } from "../src/memory-store.js";
import type { ProtectionRecord } from "../src/model.js";
import type { ExecutionGateway, PayboxRequestStatus, RequestSnapshot, SettlementVerifier, SubmitOutcome, SwapOrder, VerificationResult } from "../src/ports.js";
import { combineQuotes, type PriceObservation } from "../src/price.js";
import { createDemoGateway, createDemoPrices, demoAuthority, demoVerifier, demoWallet, DEMO_CREDENTIAL } from "../src/demo.js";
import type { PermissionState } from "../src/trigger.js";

const ETH = 1_000_000_000_000_000_000n;
const TX = `0x${"ab".repeat(32)}`;

class Clock {
  t = new Date("2026-10-17T12:00:00Z").getTime();
  now = () => new Date(this.t);
  advance(ms: number) {
    this.t += ms;
  }
}

/** A scriptable PayBox: each submit/get/sign returns the next scripted snapshot. */
class FakePaybox implements ExecutionGateway {
  label = "PayBox";
  canSign = true;
  submits: SwapOrder[] = [];
  signs = 0;
  gets = 0;
  submitResult: SubmitOutcome | (() => Promise<SubmitOutcome>) = { kind: "submitted", snapshot: this.snap("pending_signature") };
  states: PayboxRequestStatus[] = [];
  afterSign: PayboxRequestStatus = "pending_confirmation";
  txHash: string | null = TX;
  current: PayboxRequestStatus = "pending_signature";

  snap(status: PayboxRequestStatus, extra: Partial<RequestSnapshot> = {}): RequestSnapshot {
    return { requestId: "11111111-1111-4111-8111-111111111111", status, txHash: status === "success" || status === "pending_confirmation" || status === "error" ? this?.txHash ?? null : null, approvalUrl: null, error: null, ...extra };
  }
  async submitSwap(order: SwapOrder) {
    this.submits.push(order);
    const r = typeof this.submitResult === "function" ? await this.submitResult() : this.submitResult;
    if (r.kind === "submitted") this.current = r.snapshot.status;
    return r;
  }
  async getRequest() {
    this.gets++;
    if (this.states.length) this.current = this.states.shift()!;
    return this.snap(this.current);
  }
  async completeSignature() {
    this.signs++;
    this.current = this.afterSign;
    return this.snap(this.current);
  }
}

class FakeVerifier implements SettlementVerifier {
  result: VerificationResult = { kind: "verified", soldWei: ETH / 2n, usdcReceived: 1_795_000_000n, simulated: false };
  calls = 0;
  async verify() {
    this.calls++;
    return this.result;
  }
}

let clock: Clock;
let store: MemoryStore;
let paybox: FakePaybox;
let verifier: FakeVerifier;
let price: number;
let priceAgeMs: number;
let permission: PermissionState;
let balance: bigint;
let deps: EngineDeps;

const observation = (): PriceObservation => combineQuotes([{ source: "Coinbase", priceCents: price }], new Date(clock.t - priceAgeMs))!;

async function armed(over: Partial<ProtectionRecord> = {}): Promise<ProtectionRecord> {
  const draft = blankProtection({ id: "p1", ownerId: "o1", mode: "LIVE", instruction: "If ETH drops 10%, sell 25% of my ETH to USDC.", terms: { asset: "ETH", destinationAsset: "USDC", chain: "base", dropBps: 1000, sellBps: 2500 }, now: clock.now() });
  store.put({ ...draft, ...over });
  const r = await armProtection(store, (await store.get("p1"))!, {
    referencePriceCents: 400_000,
    referenceSources: "Coinbase + Kraken",
    balanceWei: 2n * ETH,
    credentialId: "cred-1",
    credentialName: "Main wallet",
    approvalMode: "autonomous",
    walletAddress: "0x1111111111111111111111111111111111111111",
    now: clock.now(),
  });
  if (!r.ok) throw new Error(r.message);
  return r.protection;
}

beforeEach(() => {
  clock = new Clock();
  store = new MemoryStore();
  paybox = new FakePaybox();
  verifier = new FakeVerifier();
  price = 384_000;
  priceAgeMs = 1_000;
  permission = "granted";
  balance = 2n * ETH;
  deps = {
    store,
    prices: { latest: async () => observation() },
    authority: { check: async () => permission },
    gateway: paybox,
    verifier,
    wallet: { balanceWei: async () => balance },
    now: clock.now,
  };
});

const run = () => advanceProtection("p1", deps);
const kinds = () => store.eventsFor("p1").map((e) => e.kind);

describe("arming", () => {
  it("freezes reference, trigger and maximum at arming", async () => {
    const p = await armed();
    expect(p).toMatchObject({ status: "ARMED", referencePriceCents: 400_000, triggerPriceCents: 360_000, maxSellWei: (ETH / 2n).toString(), balanceAtArmWei: (2n * ETH).toString() });
    expect(kinds()).toEqual(["PERMISSION_GRANTED", "REFERENCE_CAPTURED", "PROTECTION_ARMED"]);
  });

  it("cannot be armed twice, so an armed policy can't be re-derived", async () => {
    const p = await armed();
    const again = await armProtection(store, p, { referencePriceCents: 100_000, referenceSources: "x", balanceWei: 100n * ETH, credentialId: "c", credentialName: "c", approvalMode: "autonomous", walletAddress: null, now: clock.now() });
    expect(again.ok).toBe(false);
    expect((await store.get("p1"))!.triggerPriceCents).toBe(360_000);
  });

  it("refuses to arm an empty wallet", async () => {
    const draft = blankProtection({ id: "p2", ownerId: "o", mode: "LIVE", instruction: "", terms: { asset: "ETH", destinationAsset: "USDC", chain: "base", dropBps: 1000, sellBps: 2500 }, now: clock.now() });
    store.put(draft);
    const r = await armProtection(store, draft, { referencePriceCents: 400_000, referenceSources: "x", balanceWei: 0n, credentialId: "c", credentialName: "c", approvalMode: "autonomous", walletAddress: null, now: clock.now() });
    expect(r).toMatchObject({ ok: false, code: "no_balance" });
  });
});

describe("monitoring", () => {
  it("holds above the trigger and records the price", async () => {
    await armed();
    const p = await run();
    expect(p).toMatchObject({ status: "ARMED", lastPriceCents: 384_000, pauseReason: null });
    expect(paybox.submits).toHaveLength(0);
  });

  it("pauses on a stale price and never contacts PayBox", async () => {
    await armed();
    price = 100_000;
    priceAgeMs = 120_000;
    const p = await run();
    expect(p).toMatchObject({ status: "ARMED", pauseReason: "price_stale" });
    expect(paybox.submits).toHaveLength(0);
    expect(kinds()).toContain("MONITORING_PAUSED");
  });

  it("pauses when the price feed is down", async () => {
    await armed();
    deps.prices = { latest: async () => { throw new Error("down"); } };
    expect(await run()).toMatchObject({ status: "ARMED", pauseReason: "price_unavailable" });
  });

  it("resumes when a fresh price returns", async () => {
    await armed();
    priceAgeMs = 120_000;
    await run();
    priceAgeMs = 1_000;
    clock.advance(1_000);
    expect(await run()).toMatchObject({ status: "ARMED", pauseReason: null });
    expect(kinds()).toContain("MONITORING_RESUMED");
  });

  it("pauses when PayBox permission is revoked, and does not execute", async () => {
    await armed();
    clock.advance(6 * 60_000);
    permission = "revoked";
    price = 300_000;
    expect(await run()).toMatchObject({ status: "ARMED", pauseReason: "permission_revoked" });
    expect(paybox.submits).toHaveLength(0);
  });

  it("re-checks permission at the moment of triggering", async () => {
    await armed();
    clock.advance(10_000); // inside the recheck window
    permission = "revoked";
    price = 350_000;
    expect(await run()).toMatchObject({ status: "ARMED", pauseReason: "permission_revoked" });
    expect(paybox.submits).toHaveLength(0);
  });

  it("does nothing for a revoked protection", async () => {
    const p = await armed();
    await revokeProtection(store, p, clock.now());
    price = 100_000;
    expect(await run()).toMatchObject({ status: "REVOKED" });
    expect(paybox.submits).toHaveLength(0);
  });
});

describe("execution", () => {
  it("runs trigger → PayBox → confirmation → verification → complete", async () => {
    await armed();
    price = 359_000;
    let p = await run();
    // Trigger, submit and the in-process signature all happen in one pass.
    expect(p).toMatchObject({ status: "EXECUTING", stage: "SETTLING", payboxRequestId: "11111111-1111-4111-8111-111111111111" });
    expect(paybox.submits).toEqual([{ credentialId: "cred-1", amountWei: ETH / 2n, valueCents: 179_500 }]);
    expect(paybox.signs).toBe(1);

    paybox.states = ["success"];
    p = await run();
    expect(p).toMatchObject({ status: "COMPLETED", txHash: TX, soldWei: (ETH / 2n).toString(), usdcReceived: "1795000000", executionPriceCents: 359_000 });
    expect(kinds()).toEqual([
      "PERMISSION_GRANTED", "REFERENCE_CAPTURED", "PROTECTION_ARMED", "TRIGGER_CROSSED", "PAYBOX_SUBMITTED",
      "PAYBOX_SIGNATURE_REQUIRED", "PAYBOX_SIGNED", "PAYBOX_BROADCAST", "TRANSACTION_EXECUTED", "TRANSACTION_VERIFIED",
    ]);
  });

  it("sells the policy share of the current balance, capped at the armed maximum", async () => {
    await armed();
    balance = 10n * ETH; // grew after arming
    price = 350_000;
    await run();
    expect(paybox.submits[0]!.amountWei).toBe(ETH / 2n);
  });

  it("sells less when the balance shrank", async () => {
    await armed();
    balance = ETH;
    price = 350_000;
    await run();
    expect(paybox.submits[0]!.amountWei).toBe(ETH / 4n);
  });

  it("fails without contacting PayBox when there is no ETH", async () => {
    await armed();
    balance = 0n;
    price = 350_000;
    expect(await run()).toMatchObject({ status: "FAILED", failureCode: "insufficient_balance", fundsMoved: "no" });
    expect(paybox.submits).toHaveLength(0);
  });

  it("never marks complete before verification succeeds", async () => {
    await armed();
    price = 350_000;
    paybox.afterSign = "success";
    verifier.result = { kind: "pending" };
    const p = await run();
    expect(p).toMatchObject({ status: "EXECUTING", stage: "VERIFYING" });
    expect(p!.completedAt).toBeNull();
    expect(kinds()).not.toContain("TRANSACTION_VERIFIED");
  });

  it("holds for review when verification never finds the transaction", async () => {
    await armed();
    price = 350_000;
    paybox.afterSign = "success";
    verifier.result = { kind: "pending" };
    await run();
    clock.advance(16 * 60_000);
    expect(await run()).toMatchObject({ status: "EXECUTING", stage: "NEEDS_REVIEW", failureCode: "verification_timeout" });
  });

  it("does not complete when no USDC arrived", async () => {
    await armed();
    price = 350_000;
    paybox.afterSign = "success";
    verifier.result = { kind: "mismatch", reason: "no USDC reached your wallet" };
    expect(await run()).toMatchObject({ stage: "NEEDS_REVIEW", failureCode: "verification_mismatch" });
  });

  it("fails honestly on a reverted transaction", async () => {
    await armed();
    price = 350_000;
    paybox.afterSign = "success";
    verifier.result = { kind: "reverted", reason: "status 0" };
    expect(await run()).toMatchObject({ status: "FAILED", failureCode: "transaction_reverted", fundsMoved: "no" });
  });

  it("flags a verified fill that exceeds the authority", async () => {
    await armed();
    price = 350_000;
    paybox.afterSign = "success";
    verifier.result = { kind: "verified", soldWei: ETH, usdcReceived: 1n, simulated: false };
    expect(await run()).toMatchObject({ stage: "NEEDS_REVIEW", failureCode: "exceeded_authority" });
  });
});

describe("PayBox request states", () => {
  beforeEach(async () => {
    await armed();
    price = 350_000;
  });

  it("pending_approval waits for the user and does not sign", async () => {
    paybox.submitResult = { kind: "submitted", snapshot: paybox.snap("pending_approval", { approvalUrl: "https://app.paybox.sh/approve/x" }) };
    let p = await run();
    expect(p).toMatchObject({ stage: "PENDING_APPROVAL", approvalUrl: "https://app.paybox.sh/approve/x" });
    expect(paybox.signs).toBe(0);
    paybox.states = ["pending_approval"];
    p = await run();
    expect(p).toMatchObject({ stage: "PENDING_APPROVAL" });
    // Approved → signing window → confirmation.
    paybox.states = ["pending_signature"];
    p = await run();
    expect(paybox.signs).toBe(1);
    expect(p).toMatchObject({ stage: "SETTLING" });
  });

  it("pending_signature without a signer surfaces the signature requirement", async () => {
    paybox.canSign = false;
    paybox.states = ["pending_signature"];
    const p = await run();
    expect(p).toMatchObject({ stage: "PENDING_SIGNATURE" });
    expect(paybox.signs).toBe(0);
    expect(kinds()).toContain("PAYBOX_SIGNATURE_REQUIRED");
  });

  it("signs a parked request at most once", async () => {
    paybox.afterSign = "pending_signature";
    await run();
    expect(paybox.signs).toBe(1);
    paybox.states = ["pending_signature", "pending_signature"];
    await run();
    await run();
    expect(paybox.signs).toBe(1);
    expect(paybox.submits).toHaveLength(1);
  });

  it("pending_settlement is followed to success", async () => {
    paybox.afterSign = "pending_settlement";
    expect(await run()).toMatchObject({ stage: "SETTLING", payboxStatus: "pending_settlement" });
    paybox.states = ["pending_confirmation"];
    expect(await run()).toMatchObject({ stage: "SETTLING", payboxStatus: "pending_confirmation" });
    paybox.states = ["success"];
    expect(await run()).toMatchObject({ status: "COMPLETED" });
  });

  it("pending_funding is surfaced as insufficient funds, without a new request", async () => {
    paybox.afterSign = "pending_funding";
    expect(await run()).toMatchObject({ stage: "PENDING_FUNDING" });
    paybox.states = ["pending_funding"];
    await run();
    expect(paybox.submits).toHaveLength(1);
  });

  it("denied fails with PayBox's decision", async () => {
    paybox.submitResult = { kind: "submitted", snapshot: paybox.snap("denied", { error: "chain not in grant" }) };
    const p = await run();
    expect(p).toMatchObject({ status: "FAILED", failureCode: "paybox_denied", fundsMoved: "no" });
    expect(p!.failureMessage).toContain("PayBox did not authorize this action");
    expect(p!.failureMessage).toContain("chain not in grant");
  });

  it("error fails and says no swap took place", async () => {
    paybox.afterSign = "error";
    paybox.txHash = null;
    expect(await run()).toMatchObject({ status: "FAILED", failureCode: "paybox_error", fundsMoved: "no" });
  });

  it("a definitive rejection fails without retrying", async () => {
    paybox.submitResult = { kind: "rejected", message: "invalid amount" };
    expect(await run()).toMatchObject({ status: "FAILED", failureCode: "paybox_rejected" });
    await run();
    expect(paybox.submits).toHaveLength(1);
  });

  it("an ambiguous submit is held for review and never resubmitted", async () => {
    paybox.submitResult = { kind: "unknown", message: "socket hang up" };
    expect(await run()).toMatchObject({ status: "EXECUTING", stage: "NEEDS_REVIEW", fundsMoved: "unknown" });
    clock.advance(60 * 60_000);
    await run();
    await run();
    expect(paybox.submits).toHaveLength(1);
  });

  it("a submit that throws is treated as unknown, not as not-happened", async () => {
    paybox.submitResult = async () => {
      throw new Error("ETIMEDOUT");
    };
    expect(await run()).toMatchObject({ stage: "NEEDS_REVIEW", failureCode: "submission_unconfirmed" });
    expect(paybox.submits).toHaveLength(1);
  });

  it("a poll timeout leaves the request where it is", async () => {
    paybox.afterSign = "pending_confirmation";
    await run();
    paybox.getRequest = async () => {
      throw new Error("timeout");
    };
    expect(await run()).toMatchObject({ stage: "SETTLING" });
    expect(paybox.submits).toHaveLength(1);
  });
});

describe("idempotency", () => {
  it("concurrent advances on a crossed trigger create exactly one PayBox request", async () => {
    await armed();
    price = 350_000;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    paybox.submitResult = async () => {
      await gate;
      return { kind: "submitted", snapshot: paybox.snap("pending_confirmation") };
    };
    const racers = Array.from({ length: 8 }, () => run());
    await new Promise((r) => setTimeout(r, 10));
    release();
    await Promise.all(racers);
    expect(paybox.submits).toHaveLength(1);
    expect(store.eventsFor("p1").filter((e) => e.kind === "TRIGGER_CROSSED")).toHaveLength(1);
    expect(store.eventsFor("p1").filter((e) => e.kind === "PAYBOX_SUBMITTED")).toHaveLength(1);
  });

  it("a restart mid-submission never submits again", async () => {
    await armed();
    price = 350_000;
    // Simulate a crash after the claim but before PayBox's answer was saved.
    store.put({ ...(await store.get("p1"))!, status: "EXECUTING", stage: "SUBMITTING", triggeredAt: clock.now(), triggerObservedCents: 350_000, submitStartedAt: clock.now(), sellWei: (ETH / 2n).toString() });
    expect(await run()).toMatchObject({ stage: "SUBMITTING" }); // still within the lease
    clock.advance(11 * 60_000);
    expect(await run()).toMatchObject({ stage: "NEEDS_REVIEW", failureCode: "submission_unconfirmed" });
    expect(paybox.submits).toHaveLength(0);
  });

  it("a completed protection never executes again", async () => {
    await armed();
    price = 350_000;
    paybox.afterSign = "success";
    await run();
    expect((await store.get("p1"))!.status).toBe("COMPLETED");
    for (let i = 0; i < 5; i++) await run();
    expect(paybox.submits).toHaveLength(1);
    expect(verifier.calls).toBe(1);
  });

  it("revoke and trigger cannot both win", async () => {
    const p = await armed();
    price = 350_000;
    const [, revoked] = await Promise.all([run(), revokeProtection(store, p, clock.now())]);
    const final = (await store.get("p1"))!;
    if (revoked.ok) {
      expect(final.status).toBe("REVOKED");
      expect(paybox.submits).toHaveLength(0);
    } else {
      expect(final.status).not.toBe("REVOKED");
      expect(paybox.submits).toHaveLength(1);
    }
  });

  it("cannot revoke once PayBox has the request", async () => {
    await armed();
    price = 350_000;
    paybox.afterSign = "pending_confirmation";
    const p = await run();
    expect(await revokeProtection(store, p!, clock.now())).toMatchObject({ ok: false, code: "executing" });
  });
});

describe("demo mode runs the same engine", () => {
  it("goes from armed to verified with simulated adapters and no transaction hash", async () => {
    const draft = blankProtection({ id: "d1", ownerId: "o", mode: "DEMO", instruction: "If ETH drops 10%, sell 25% of my ETH to USDC.", terms: { asset: "ETH", destinationAsset: "USDC", chain: "base", dropBps: 1000, sellBps: 2500 }, now: clock.now() });
    store.put(draft);
    const r = await armProtection(store, draft, { referencePriceCents: 400_000, referenceSources: "Simulated market", balanceWei: 2n * ETH, credentialId: DEMO_CREDENTIAL.id, credentialName: DEMO_CREDENTIAL.name, approvalMode: "autonomous", walletAddress: null, now: clock.now() });
    expect(r.ok).toBe(true);
    const demo: EngineDeps = { store, prices: createDemoPrices(clock.now), authority: demoAuthority, gateway: createDemoGateway(clock.now), verifier: demoVerifier, wallet: demoWallet, now: clock.now };
    const step = () => advanceProtection("d1", demo);

    clock.advance(5_000);
    expect(await step()).toMatchObject({ status: "ARMED" });
    await store.transition("d1", { status: "ARMED" }, { demoDropAt: clock.now() });
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      clock.advance(500);
      const p = (await step())!;
      seen.add(p.stage ?? p.status);
      if (p.status === "COMPLETED") break;
    }
    const done = (await store.get("d1"))!;
    expect(done.status).toBe("COMPLETED");
    expect(done.txHash).toBeNull();
    expect(BigInt(done.soldWei!)).toBe(ETH / 2n);
    expect(seen).toEqual(new Set(["ARMED", "PENDING_SIGNATURE", "SETTLING", "VERIFYING", "COMPLETED"]));
  });
});
