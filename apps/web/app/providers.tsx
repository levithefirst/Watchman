"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "./lib/wagmi-config";
import "@rainbow-me/rainbowkit/styles.css";

const rainbowKitTheme = lightTheme({
  accentColor: "#111111",
  accentColorForeground: "#F7F5F0",
  borderRadius: "medium",
  fontStack: "system",
});

export default function Providers({ children }: { children: React.ReactNode }): React.ReactElement {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowKitTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
