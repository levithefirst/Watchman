import type { Mode } from "@watchman/core";
import { Lock, Shield } from "./icons";

export function Chrome({ mode, children }: { mode: Mode; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="shell">
      <header className="topbar">
        <a href="/" className="wordmark" aria-label="Watchman home">
          <Shield size={18} />
          WATCHMAN
        </a>
        {mode === "LIVE" ? (
          <span className="pill" data-tone="accent" title="Real PayBox requests on Base mainnet">
            <span className="dot" />
            Live · Base
          </span>
        ) : (
          <span className="pill" title="Simulated market and simulated PayBox settlement. Same policy engine, state machine and screens as live.">
            Demo
          </span>
        )}
      </header>
      <main id="main" className="screen">{children}</main>
      <footer className="footer">
        <span className="badge-paybox">
          <Lock size={14} />
          Authority secured by PayBox
        </span>
        <span>Watchman never holds your private key.</span>
      </footer>
    </div>
  );
}
