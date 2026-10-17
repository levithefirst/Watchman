import { describe, expect, it } from "vitest";
import { USDC_BASE, TRANSFER_TOPIC } from "../src/constants.js";
import { blankProtection } from "../src/memory-store.js";
import { createPayboxAuthority, createPayboxGateway, evmAddressOf, pickWallet, snapshotFrom } from "../src/live/paybox.js";
import { settlementFrom } from "../src/live/base.js";

const REQ = "22222222-2222-4222-8222-222222222222";
const TX = `0x${"cd".repeat(32)}`;
const WALLET = "0x1111111111111111111111111111111111111111";

type Handler = (method: string, path: string, body: unknown) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;

/** A stand-in for api.paybox.sh that records exactly what the real SDK sends. */
function fakePaybox(handler: Handler) {
  const calls: Array<{ method: string; path: string; body: unknown; auth: string | null }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", path: url.pathname, body, auth: headers.get("authorization") });
    const r = await handler(init?.method ?? "GET", url.pathname, body);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const protection = blankProtection({ id: "p", ownerId: "o", mode: "LIVE", instruction: "", terms: { asset: "ETH", destinationAsset: "USDC", chain: "base", dropBps: 1000, sellBps: 2500 }, now: new Date() });
const order = { credentialId: "cred-1", amountWei: 500_000_000_000_000_000n, valueCents: 179_500 };
const env = { apiKey: "pbx_live_test" };

describe("PayBox gateway (real SDK, fake API)", () => {
  it("sends the exact ETH → USDC swap on Base and nothing else", async () => {
    const api = fakePaybox((method, path) =>
      method === "POST" && path === "/agent/swap"
        ? { status: 200, body: { response: { request_id: REQ, status: "pending_approval", output: null, approval_id: "a1", error: null, approval_url: "https://app.paybox.sh/approvals/a1" }, plan: null } }
        : { status: 404, body: {} },
    );
    const outcome = await createPayboxGateway(env, api.fetchImpl).submitSwap(order, protection);
    expect(outcome).toEqual({ kind: "submitted", snapshot: { requestId: REQ, status: "pending_approval", txHash: null, approvalUrl: "https://app.paybox.sh/approvals/a1", error: null } });
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]).toMatchObject({ method: "POST", path: "/agent/swap", auth: "Bearer pbx_live_test" });
    expect(api.calls[0]!.body).toEqual({
      operation: {
        type: "swap",
        credential_id: "cred-1",
        src_chain: "eip155:8453",
        dst_chain: "eip155:8453",
        src_token: "native",
        dst_token: USDC_BASE,
        amount: "500000000000000000",
        swap_direction: "exact-amount-in",
        slippage_bps: 100,
        recipient: null,
        value_cents: 179_500,
      },
    });
  });

  it("reads the confirmed transaction hash on success", async () => {
    const api = fakePaybox(() => ({ status: 200, body: { request_id: REQ, status: "success", output: { output_type: "tx_hash", value: { tx_hash: TX } }, approval_id: null, error: null } }));
    expect(await createPayboxGateway(env, api.fetchImpl).getRequest(REQ, protection)).toMatchObject({ status: "success", txHash: TX });
    expect(api.calls[0]).toMatchObject({ method: "GET", path: `/agent/requests/${REQ}` });
  });

  it("treats a 4xx refusal as rejected — nothing was created", async () => {
    const api = fakePaybox(() => ({ status: 403, body: { error: "credential not granted to this client" } }));
    expect(await createPayboxGateway(env, api.fetchImpl).submitSwap(order, protection)).toEqual({ kind: "rejected", message: "credential not granted to this client" });
  });

  it("treats a 5xx or network failure as unknown — it may have been created", async () => {
    const down = fakePaybox(() => ({ status: 503, body: {} }));
    expect((await createPayboxGateway(env, down.fetchImpl).submitSwap(order, protection)).kind).toBe("unknown");
    const throwing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect((await createPayboxGateway(env, throwing).submitSwap(order, protection)).kind).toBe("unknown");
  });

  it("keeps the request id it was given even if the SDK call fails afterwards", async () => {
    // PayBox answers a retryable error; the SDK re-submits once and that
    // second call dies on the network. Watchman must still own the first id.
    let posts = 0;
    const api = fakePaybox((method, path) => {
      if (method === "POST" && path === "/agent/swap") {
        posts++;
        if (posts === 1) return { status: 200, body: { response: { request_id: REQ, status: "error", output: null, approval_id: null, error: "quote expired", retryable: true }, plan: null } };
        throw new TypeError("socket hang up");
      }
      return { status: 200, body: { request_id: REQ, status: "error", output: null, approval_id: null, error: "quote expired" } };
    });
    const outcome = await createPayboxGateway(env, api.fetchImpl).submitSwap(order, protection);
    expect(outcome).toMatchObject({ kind: "submitted", snapshot: { requestId: REQ, status: "error" } });
  });

  it("checks the grant by credential id", async () => {
    const list = { credentials: [{ credential: { id: "cred-1", user_id: "u", name: "Main", credential_type: "wallet", provider: "moonx", metadata: { address: WALLET }, created_at: "", disabled_at: null }, grant: { credential_id: "cred-1", approval_mode: "autonomous" } }], ungranted: [], agent_signer_recorded: true };
    const api = fakePaybox(() => ({ status: 200, body: list }));
    const authority = createPayboxAuthority(env, api.fetchImpl);
    expect(await authority.check({ ...protection, payboxCredentialId: "cred-1" })).toBe("granted");
    expect(await authority.check({ ...protection, payboxCredentialId: "cred-2" })).toBe("revoked");
    expect(api.calls[0]).toMatchObject({ path: "/agent/grants" });
  });
});

describe("PayBox response parsing", () => {
  it("accepts tx hashes in the shapes PayBox uses", () => {
    expect(snapshotFrom({ request_id: REQ, status: "success", output: { value: TX } as never, approval_id: null, error: null }).txHash).toBe(TX);
    expect(snapshotFrom({ request_id: REQ, status: "pending_confirmation", output: null, approval_id: null, error: null, tx_hash: TX } as never).txHash).toBe(TX);
    expect(snapshotFrom({ request_id: REQ, status: "success", output: { value: { tx_hash: "nope" } } as never, approval_id: null, error: null }).txHash).toBeNull();
  });

  it("only trusts https approval links", () => {
    expect(snapshotFrom({ request_id: REQ, status: "pending_approval", output: null, approval_id: "a", error: null, approval_url: "javascript:alert(1)" } as never).approvalUrl).toBeNull();
  });

  it("finds the wallet's EVM address in credential metadata", () => {
    expect(evmAddressOf({ address: WALLET })).toBe(WALLET);
    expect(evmAddressOf({ chains: { evm: { addr: WALLET } } })).toBe(WALLET);
    expect(evmAddressOf({ address: "So1ana111" })).toBeNull();
  });

  it("picks a granted EVM wallet, or explains what's missing", () => {
    const c = (id: string, type: string, metadata: unknown, disabled: string | null = null) => ({ credential: { id, user_id: "u", name: id, credential_type: type, provider: "p", metadata, created_at: "", disabled_at: disabled }, grant: { credential_id: id, approval_mode: "always_approve" } });
    expect(pickWallet({ credentials: [c("card", "card", {}), c("w", "wallet", { address: WALLET })], ungranted: [], agent_signer_recorded: true } as never)).toMatchObject({ kind: "granted", wallet: { credentialId: "w", address: WALLET, approvalMode: "always_approve" } });
    expect(pickWallet({ credentials: [c("w", "wallet", { address: WALLET }, "2026-01-01")], ungranted: [{ credential_id: "x", name: "Main", kind: "wallet", metadata: {} }], agent_signer_recorded: true } as never)).toEqual({ kind: "not_granted", ungrantedWallets: ["Main"] });
    expect(pickWallet({ credentials: [c("sol", "wallet", { address: "So1" })], ungranted: [], agent_signer_recorded: true } as never)).toEqual({ kind: "no_evm_address", name: "sol" });
  });
});

describe("Base settlement verification", () => {
  const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;
  const usdcIn = (amount: bigint, to = WALLET) => ({ address: USDC_BASE.toLowerCase(), topics: [TRANSFER_TOPIC, pad("0x9999999999999999999999999999999999999999"), pad(to)], data: `0x${amount.toString(16)}` });
  const ordered = 500_000_000_000_000_000n;

  it("verifies a successful swap from the receipt", () => {
    const r = settlementFrom({ status: "0x1", logs: [usdcIn(1_795_000_000n)] }, { from: WALLET, value: `0x${ordered.toString(16)}` }, WALLET, ordered);
    expect(r).toEqual({ kind: "verified", soldWei: ordered, usdcReceived: 1_795_000_000n, simulated: false });
  });

  it("rejects a reverted transaction", () => {
    expect(settlementFrom({ status: "0x0", logs: [] }, null, WALLET, ordered).kind).toBe("reverted");
  });

  it("rejects success with no USDC to the wallet", () => {
    expect(settlementFrom({ status: "0x1", logs: [usdcIn(5n, "0x2222222222222222222222222222222222222222")] }, null, WALLET, ordered).kind).toBe("mismatch");
  });

  it("ignores lookalike tokens", () => {
    const fake = { ...usdcIn(1_000_000_000n), address: "0x0000000000000000000000000000000000000bad" };
    expect(settlementFrom({ status: "0x1", logs: [fake] }, null, WALLET, ordered).kind).toBe("mismatch");
  });
});
