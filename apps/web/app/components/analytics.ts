/**
 * Dependency-free analytics seam.
 *
 * Every meaningful product event flows through `track()`. Today it emits a
 * DOM CustomEvent and pushes to `window.dataLayer` if one exists, so wiring
 * up GA/Segment/PostHog later is a listener, not a refactor. No third-party
 * script and no new secrets are required for this to be useful now.
 */

export type WatchmanEvent =
  | "demo_started"
  | "wallet_connected"
  | "quote_requested"
  | "quote_received"
  | "protection_created"
  | "hedge_receipt_viewed"
  | "hedge_list_viewed"
  | "policy_created"
  | "faucet_requested"
  | "funding_help_opened"
  | "cta_clicked";

type Payload = Record<string, string | number | boolean | null | undefined>;

interface DataLayerWindow extends Window {
  dataLayer?: Array<Record<string, unknown>>;
}

export function track(event: WatchmanEvent, payload: Payload = {}): void {
  if (typeof window === "undefined") return;
  const detail = { event, ...payload, ts: Date.now() };
  try {
    const w = window as DataLayerWindow;
    if (Array.isArray(w.dataLayer)) w.dataLayer.push(detail);
    window.dispatchEvent(new CustomEvent("watchman:analytics", { detail }));
  } catch {
    /* analytics must never break the product */
  }
}
