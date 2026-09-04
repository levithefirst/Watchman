"use client";

import { useEffect, useRef } from "react";
import { Button } from "./ui";

const SOMNIA_HACKS_TELEGRAM = "https://t.me/+XHq0F0JXMyhmMzM0";

/**
 * Where to get testnet funds.
 *
 * Watchman does not run a faucet, and the built-in dev helper is disabled in
 * production, so tapping "Fund with tUSDC" used to dead-end on a 403. This
 * points at the real sources instead. `onDevFaucet` is only passed when the
 * server reports the local helper is actually usable.
 */
export default function FundingPanel({
  onClose,
  onDevFaucet,
  devFaucetBusy,
}: {
  onClose: () => void;
  onDevFaucet?: () => void;
  devFaucetBusy?: boolean;
}): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (!panelRef.current?.contains(event.target as Node)) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="funding-title"
        className="w-full max-w-md rounded-[22px] border-[3px] border-ink bg-paper p-6 shadow-[6px_6px_0_0_#111] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="funding-title" className="text-2xl font-bold tracking-tight">
            Need testnet funds?
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="wm-press grid h-9 w-9 shrink-0 place-items-center rounded-xl border-[3px] border-ink bg-white text-lg font-bold leading-none"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-base leading-7 text-ink-soft">
          Placing a real hedge on Somnia Shannon costs testnet tUSDC for the premium and a little
          STT for gas. Watchman does not run a faucet. Get testnet funds from the Somnia Hacks
          community, then come back to this page.
        </p>

        <a
          href={SOMNIA_HACKS_TELEGRAM}
          target="_blank"
          rel="noreferrer noopener"
          className="wm-press mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-[3px] border-ink bg-yellow px-5 py-4 text-sm font-bold uppercase tracking-wide text-ink no-underline"
        >
          Get testnet funds ↗
        </a>

        <p className="mt-4 text-sm leading-6 text-ink-soft">
          Opens the Somnia Hacks Telegram group in a new tab.
        </p>

        {onDevFaucet ? (
          <div className="mt-6 border-t-[3px] border-paper-deep pt-5">
            <p className="wm-eyebrow text-ink-mute">Local development</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              This build is running outside production with a server wallet configured, so the
              built-in tUSDC helper is available.
            </p>
            <Button tone="white" size="sm" className="mt-3" onClick={onDevFaucet} disabled={devFaucetBusy}>
              {devFaucetBusy ? "Funding…" : "Use dev faucet"}
            </Button>
          </div>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-ink-soft">
          Demo mode needs none of this. It runs the full quote, hedge and receipt flow with a
          simulated order and no funds at all.
        </p>
      </div>
    </div>
  );
}
