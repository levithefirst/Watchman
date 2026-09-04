import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  braveWallet,
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  trustWallet,
  walletConnectWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { defineChain } from "viem";

/**
 * Same chain id, RPC and native currency as packages/sdk/src/client.ts —
 * kept in sync by hand since the frontend cannot import server-only SDK
 * config that also pulls in a private-key-capable viem client.
 */
export const somniaShannon = defineChain({
  id: 50312,
  name: "Somnia Shannon",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.infra.testnet.somnia.network"] } },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: "https://shannon-explorer.somnia.network" },
  },
  testnet: true,
});

/**
 * WalletConnect's Cloud project id, required for the QR-code/deep-link path
 * that lets mobile wallets (and any wallet without a browser extension)
 * connect. Get one free at https://cloud.reown.com and set
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID on Vercel — see .env.example.
 *
 * Without it, the picker still lists every wallet below and still connects
 * any browser-injected one (MetaMask, Rabby, Coinbase, OKX, Trust, Brave —
 * anything that injects window.ethereum, including a wallet's own in-app
 * mobile browser). Only the WalletConnect QR/deep-link path — the thing
 * that lets a *separate* wallet app connect to a normal mobile browser tab
 * — is unavailable until a real project id is set.
 */
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
export const WALLETCONNECT_CONFIGURED = walletConnectProjectId.length > 0;

/**
 * Explicit wallet roster rather than RainbowKit's default curated set,
 * which only surfaces a handful of "popular" options. Each entry here is a
 * real RainbowKit connector — nothing here is a hardcoded fake list; if a
 * wallet's browser extension isn't installed, RainbowKit shows it with an
 * "Install" link instead of a broken connect button, and WalletConnect
 * covers every other EVM wallet (mobile or desktop) through the standard
 * WalletConnect protocol.
 */
const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet],
    },
    {
      groupName: "More",
      wallets: [okxWallet, trustWallet, braveWallet, zerionWallet, injectedWallet],
    },
  ],
  {
    appName: "Watchman",
    projectId: walletConnectProjectId || "00000000000000000000000000000000",
  },
);

export const wagmiConfig = createConfig({
  connectors,
  chains: [somniaShannon],
  transports: { [somniaShannon.id]: http() },
  ssr: true,
});
