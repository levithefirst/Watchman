import { PayboxClient, PayboxError, type AgentResponse, type ClientCredentialList } from "@paybox-sh/sdk";
import { BASE_CAIP2, NATIVE_TOKEN, SWAP_SLIPPAGE_BPS, USDC_BASE } from "../constants.js";
import type { ProtectionRecord } from "../model.js";
import type { AuthorityPort, ExecutionGateway, PayboxRequestStatus, RequestSnapshot, SubmitOutcome, SwapOrder } from "../ports.js";
import type { PermissionState } from "../trigger.js";

/**
 * Watchman's only path to money: the official PayBox SDK, authenticated as
 * the Watchman agent. PAYBOX_API_KEY identifies the agent; PAYBOX_SIGNING_KEY
 * is the agent signer paired to it in PayBox. Neither is a wallet key — the
 * wallet's key stays in PayBox's MPC custody, and every request is checked
 * against the grant the user gave this agent.
 */
export interface PayboxEnv {
  apiKey?: string;
  accessToken?: string;
  signingKey?: string;
  baseUrl?: string;
}

export function payboxEnv(env: NodeJS.ProcessEnv = process.env): PayboxEnv {
  return { apiKey: env.PAYBOX_API_KEY || undefined, accessToken: env.PAYBOX_ACCESS_TOKEN || undefined, signingKey: env.PAYBOX_SIGNING_KEY || undefined, baseUrl: env.PAYBOX_API_URL || undefined };
}

export function payboxConfigured(env: PayboxEnv = payboxEnv()): boolean {
  return Boolean(env.apiKey || env.accessToken);
}

export function createPayboxClient(env: PayboxEnv = payboxEnv(), fetchImpl?: typeof fetch): PayboxClient {
  return new PayboxClient({ apiKey: env.apiKey, token: env.accessToken, signingKey: env.signingKey, baseUrl: env.baseUrl, fetchImpl });
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

function txHashOf(response: AgentResponse): string | null {
  const raw = response as AgentResponse & Record<string, unknown>;
  const value = response.output?.value as unknown;
  const candidates: unknown[] = [
    typeof value === "string" ? value : undefined,
    value && typeof value === "object" ? (value as Record<string, unknown>).tx_hash : undefined,
    value && typeof value === "object" ? (value as Record<string, unknown>).txHash : undefined,
    value && typeof value === "object" ? (value as Record<string, unknown>).hash : undefined,
    raw.tx_hash,
    raw.txHash,
  ];
  const hit = candidates.find((c): c is string => typeof c === "string" && TX_HASH.test(c));
  return hit ?? null;
}

const KNOWN: ReadonlySet<string> = new Set([
  "pending_approval", "pending_funding", "pending_signature", "pending_settlement", "pending_confirmation", "success", "denied", "error",
]);

export function snapshotFrom(response: AgentResponse): RequestSnapshot {
  const raw = response as AgentResponse & Record<string, unknown>;
  const approvalUrl = typeof raw.approval_url === "string" && /^https:\/\//.test(raw.approval_url) ? raw.approval_url : null;
  const reason = typeof raw.reason === "string" ? raw.reason : typeof raw.message === "string" ? raw.message : null;
  return {
    requestId: response.request_id,
    status: (KNOWN.has(response.status) ? response.status : (response.status as string)) as PayboxRequestStatus,
    txHash: txHashOf(response),
    approvalUrl,
    error: response.error ?? reason,
  };
}

function errorMessage(error: PayboxError): string {
  try {
    const body = JSON.parse(error.body) as { error?: string; message?: string; reason?: string };
    return body.error ?? body.message ?? body.reason ?? `HTTP ${error.status}`;
  } catch {
    return error.body?.slice(0, 160) || `HTTP ${error.status}`;
  }
}

/** A 4xx other than these means PayBox refused before creating anything. */
const AMBIGUOUS_STATUS = new Set([408, 409, 425]);

export function createPayboxGateway(env: PayboxEnv = payboxEnv(), baseFetch: typeof fetch = fetch): ExecutionGateway {
  const canSign = Boolean(env.signingKey);
  const reader = createPayboxClient(env, baseFetch);

  return {
    label: "PayBox",
    canSign,

    async submitSwap(order: SwapOrder): Promise<SubmitOutcome> {
      // requestSwap creates the request and, with a paired signer, signs it in
      // the same call. Capture the request id the moment PayBox returns it, so
      // a failure later in that call can never leave Watchman not knowing
      // which request it owns — and therefore never tempted to submit again.
      let captured: string | null = null;
      const capturing: typeof fetch = async (input, init) => {
        const res = await baseFetch(input, init);
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (!captured && res.ok && init?.method === "POST" && /\/agent\/swap$/.test(new URL(url).pathname)) {
          try {
            const body = (await res.clone().json()) as { response?: { request_id?: string } };
            captured = body.response?.request_id ?? null;
          } catch {
            /* the SDK will surface the parse failure itself */
          }
        }
        return res;
      };
      const client = createPayboxClient(env, capturing);
      try {
        const { response } = await client.requestSwap(
          {
            credentialId: order.credentialId,
            srcChain: BASE_CAIP2,
            dstChain: BASE_CAIP2,
            srcToken: NATIVE_TOKEN,
            dstToken: USDC_BASE,
            amount: order.amountWei.toString(),
            swapDirection: "exact-amount-in",
            slippageBps: SWAP_SLIPPAGE_BPS,
            valueCents: order.valueCents,
          },
          { autoSign: canSign, waitForApproval: false },
        );
        if (!response?.request_id) {
          return captured ? { kind: "submitted", snapshot: snapshotFrom(await reader.getRequest(captured)) } : { kind: "unknown", message: "PayBox returned no request id" };
        }
        return { kind: "submitted", snapshot: snapshotFrom(response) };
      } catch (error) {
        if (captured) {
          try {
            return { kind: "submitted", snapshot: snapshotFrom(await reader.getRequest(captured)) };
          } catch {
            return { kind: "submitted", snapshot: { requestId: captured, status: "pending_signature", txHash: null, approvalUrl: null, error: null } };
          }
        }
        if (error instanceof PayboxError && error.status >= 400 && error.status < 500 && !AMBIGUOUS_STATUS.has(error.status)) {
          return { kind: "rejected", message: errorMessage(error) };
        }
        return { kind: "unknown", message: error instanceof Error ? error.message : String(error) };
      }
    },

    async getRequest(requestId: string): Promise<RequestSnapshot> {
      return snapshotFrom(await reader.getRequest(requestId));
    },

    async completeSignature(requestId: string): Promise<RequestSnapshot> {
      // resumeRequest reads the stored request and signs that same request; it
      // never invokes a new swap. One attempt per request, enforced by the engine.
      const result = await reader.resumeRequest(requestId, { autoSign: true, waitForApproval: false, timeoutMs: 90_000 });
      return snapshotFrom(result.response ?? (await reader.getRequest(requestId)));
    },
  };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Finds the wallet's EVM address in PayBox credential metadata, preferring keys that say so. */
export function evmAddressOf(metadata: unknown): string | null {
  const preferred = ["address", "evm_address", "evmAddress", "wallet_address", "walletAddress"];
  const seen = new Set<unknown>();
  const walk = (value: unknown, depth: number): string | null => {
    if (depth > 4 || value == null || seen.has(value)) return null;
    if (typeof value === "string") return ADDRESS.test(value) ? value : null;
    if (typeof value !== "object") return null;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of preferred) {
      if (typeof record[key] === "string" && ADDRESS.test(record[key] as string)) return record[key] as string;
    }
    for (const child of Object.values(record)) {
      const hit = walk(child, depth + 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(metadata, 0);
}

export interface GrantedWallet {
  credentialId: string;
  name: string;
  approvalMode: string;
  address: string;
}

export type WalletDiscovery =
  | { kind: "granted"; wallet: GrantedWallet; others: number }
  | { kind: "not_granted"; ungrantedWallets: string[] }
  | { kind: "no_evm_address"; name: string };

export function pickWallet(list: ClientCredentialList): WalletDiscovery {
  const wallets = list.credentials.filter((c) => c.credential.credential_type === "wallet" && !c.credential.disabled_at);
  const evm = wallets
    .map((c) => ({ c, address: evmAddressOf(c.credential.metadata) }))
    .filter((w): w is { c: (typeof wallets)[number]; address: string } => Boolean(w.address));
  if (evm.length > 0) {
    const { c, address } = evm[0]!;
    return { kind: "granted", wallet: { credentialId: c.credential.id, name: c.credential.name, approvalMode: c.grant.approval_mode, address }, others: evm.length - 1 };
  }
  if (wallets.length > 0) return { kind: "no_evm_address", name: wallets[0]!.credential.name };
  return { kind: "not_granted", ungrantedWallets: list.ungranted.filter((u) => u.kind === "wallet").map((u) => u.name) };
}

export function createPayboxAuthority(env: PayboxEnv = payboxEnv(), fetchImpl?: typeof fetch): AuthorityPort {
  const client = createPayboxClient(env, fetchImpl);
  return {
    async check(p: ProtectionRecord): Promise<PermissionState> {
      if (!p.payboxCredentialId) return "revoked";
      const list = await client.listCredentials();
      const grant = list.credentials.find((c) => c.credential.id === p.payboxCredentialId);
      return grant && !grant.credential.disabled_at ? "granted" : "revoked";
    },
  };
}

/** The swap operation exactly as requestSwap will send it, for PayBox's readiness check. */
export function swapOperation(credentialId: string, amountWei: bigint): Record<string, unknown> {
  return {
    type: "swap",
    credential_id: credentialId,
    src_chain: BASE_CAIP2,
    dst_chain: BASE_CAIP2,
    src_token: NATIVE_TOKEN,
    dst_token: USDC_BASE,
    amount: amountWei.toString(),
    swap_direction: "exact-amount-in",
    slippage_bps: SWAP_SLIPPAGE_BPS,
    recipient: null,
    value_cents: null,
  };
}
