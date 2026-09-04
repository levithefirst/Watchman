import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Guards the WebSocket RPC configuration.
 *
 * The markets SDK has no HTTP fallback, so a missing or malformed socket URL
 * takes down every on-chain read. Production surfaced that as a bogus
 * "no liquidity" state, so the resolver is expected to fail loudly instead.
 * WATCHMAN_WS_RPC_URL is read at module load, hence the module reset per case.
 */
const loadConfig = async (wsUrl?: string): Promise<typeof import("../src/config.js")> => {
  vi.resetModules();
  if (wsUrl === undefined) delete process.env.SOMNIA_WS_RPC_URL;
  else process.env.SOMNIA_WS_RPC_URL = wsUrl;
  return import("../src/config.js");
};

afterEach(() => {
  delete process.env.SOMNIA_WS_RPC_URL;
  vi.resetModules();
});

describe("Somnia WebSocket RPC configuration", () => {
  it("defaults to the public Shannon socket so no deployment has to configure one", async () => {
    const { WATCHMAN_WS_RPC_URL, resolveWsRpcUrl } = await loadConfig();
    expect(WATCHMAN_WS_RPC_URL).toBe("wss://api.infra.testnet.somnia.network/ws");
    expect(resolveWsRpcUrl()).toBe("wss://api.infra.testnet.somnia.network/ws");
  });

  it("lets an operator point at their own node", async () => {
    const { resolveWsRpcUrl } = await loadConfig("wss://node.internal.example/ws");
    expect(resolveWsRpcUrl()).toBe("wss://node.internal.example/ws");
  });

  it("accepts a plain ws:// endpoint for local development", async () => {
    const { resolveWsRpcUrl } = await loadConfig("ws://127.0.0.1:8545");
    expect(resolveWsRpcUrl()).toBe("ws://127.0.0.1:8545");
  });

  it("refuses an empty value rather than letting the SDK fail opaquely later", async () => {
    const { resolveWsRpcUrl } = await loadConfig("   ");
    expect(() => resolveWsRpcUrl()).toThrow(/not configured/i);
  });

  it("refuses an https endpoint, the mistake that produces a ws-less client", async () => {
    const { resolveWsRpcUrl } = await loadConfig("https://api.infra.testnet.somnia.network");
    expect(() => resolveWsRpcUrl()).toThrow(/ws:\/\/ or wss:\/\//);
  });

  it("keeps the chain id pinned to Somnia Shannon", async () => {
    const { WATCHMAN_CHAIN_ID } = await loadConfig();
    expect(WATCHMAN_CHAIN_ID).toBe(50312);
  });
});
