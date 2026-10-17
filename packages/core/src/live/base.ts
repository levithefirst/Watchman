import { TRANSFER_TOPIC, USDC_BASE } from "../constants.js";
import type { ProtectionRecord } from "../model.js";
import type { SettlementVerifier, VerificationResult, WalletPort } from "../ports.js";

/**
 * Minimal Base JSON-RPC client. Watchman verifies outcomes against the chain
 * itself rather than trusting any one party's report — including PayBox's.
 */
export class BaseRpc {
  private id = 0;
  constructor(
    private readonly url: string = process.env.BASE_RPC_URL || "https://mainnet.base.org",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async call<T>(method: string, params: unknown[]): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) throw new Error(`Base RPC ${method} answered ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(`Base RPC ${method}: ${body.error.message ?? "error"}`);
    return body.result as T;
  }

  async balanceWei(address: string): Promise<bigint> {
    const hex = await this.call<string>("eth_getBalance", [address, "latest"]);
    if (typeof hex !== "string" || !/^0x[0-9a-fA-F]*$/.test(hex)) throw new Error("Base RPC returned a malformed balance");
    return BigInt(hex);
  }
}

export function createBaseWallet(rpc: BaseRpc = new BaseRpc()): WalletPort {
  return {
    async balanceWei(p: ProtectionRecord) {
      if (!p.walletAddress) throw new Error("no wallet address on this protection");
      return rpc.balanceWei(p.walletAddress);
    },
  };
}

interface Receipt {
  status: string;
  logs: Array<{ address: string; topics: string[]; data: string }>;
}
interface Tx {
  from: string;
  value: string;
}

const pad = (address: string) => `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

/** Pure: reads what a confirmed receipt actually did for `wallet`. */
export function settlementFrom(receipt: Receipt, tx: Tx | null, wallet: string, orderedWei: bigint): VerificationResult {
  if (receipt.status !== "0x1") return { kind: "reverted", reason: "the transaction's status is failed" };
  const usdc = USDC_BASE.toLowerCase();
  const to = pad(wallet);
  let received = 0n;
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() === usdc && log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics?.[2]?.toLowerCase() === to) {
      received += BigInt(log.data);
    }
  }
  if (received <= 0n) return { kind: "mismatch", reason: "the transaction succeeded but no USDC reached your wallet in it" };
  const value = tx && tx.from?.toLowerCase() === wallet.toLowerCase() ? BigInt(tx.value ?? "0x0") : 0n;
  return { kind: "verified", soldWei: value > 0n ? value : orderedWei, usdcReceived: received, simulated: false };
}

export function createBaseVerifier(rpc: BaseRpc = new BaseRpc()): SettlementVerifier {
  return {
    async verify({ txHash, walletAddress, protection }) {
      if (!txHash) return { kind: "mismatch", reason: "PayBox reported success without a transaction hash" };
      if (!walletAddress) return { kind: "mismatch", reason: "this protection has no wallet address to verify against" };
      const receipt = await rpc.call<Receipt | null>("eth_getTransactionReceipt", [txHash]);
      if (!receipt) return { kind: "pending" };
      const tx = await rpc.call<Tx | null>("eth_getTransactionByHash", [txHash]);
      return settlementFrom(receipt, tx, walletAddress, BigInt(protection.sellWei ?? "0"));
    },
  };
}
