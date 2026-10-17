"use client";

import type { ProtectionView } from "@watchman/core";
import { useEffect, useRef, useState } from "react";
import { api, type ApiError } from "./api";
import { Alert, Info, Spinner } from "./icons";
import { Activity } from "./Timeline";

export function Monitor({ view, offline, onChange }: { view: ProtectionView; offline: boolean; onChange: (v: ProtectionView | null) => void }): React.ReactElement {
  const [confirming, setConfirming] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const { prices, health, authority } = view;
  const demo = view.mode === "DEMO";

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (confirming && !d.open) d.showModal();
    if (!confirming && d.open) d.close();
  }, [confirming]);

  const revoke = async () => {
    setRevoking(true);
    setError(null);
    const r = await api(`/api/protection/${view.id}/revoke`, { method: "POST" });
    setRevoking(false);
    setConfirming(false);
    if (r.ok) onChange(r.data.view);
    else setError(r.error);
  };

  const simulateDrop = async () => {
    setDropping(true);
    setError(null);
    const r = await api(`/api/protection/${view.id}/simulate-drop`, { method: "POST" });
    setDropping(false);
    if (r.ok) {
      setDropped(true);
      onChange(r.data.view);
    } else setError(r.error);
  };

  const status =
    offline ? { label: "Reconnecting", tone: "warn" } : health.state === "live" ? { label: "Monitoring", tone: "ok" } : health.state === "interrupted" ? { label: "Interrupted", tone: "warn" } : { label: "Paused", tone: "warn" };
  const near = prices.progress != null && prices.progress >= 0.7;

  return (
    <section aria-labelledby="monitor-title">
      <div className="enter" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="pill" data-tone={status.tone}>
          <span className={`dot ${status.tone === "ok" ? "dot-live" : ""}`} />
          {status.label}
        </span>
        <span className="tiny subtle num" aria-live="polite">
          {prices.sources ? `Via ${prices.sources}` : null}
        </span>
      </div>

      <div className="card card-pad enter-2" style={{ marginTop: 16 }}>
        <h1 id="monitor-title" className="stat-label" style={{ margin: 0 }}>
          ETH price
        </h1>
        <div className="hero-price num" style={{ marginTop: 6 }} aria-live="polite">
          {prices.current ?? "—"}
        </div>
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          {prices.distance != null ? (
            <>
              <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>
                {prices.distance}
              </span>{" "}
              above your trigger
            </>
          ) : (
            "Waiting for the first price"
          )}
        </p>

        <div style={{ margin: "22px 0 22px" }}>
          <div className="track" role="img" aria-label={`ETH has fallen ${Math.round((prices.progress ?? 0) * 100)}% of the way to the trigger`}>
            <div className="track-fill" data-tone={near ? "warn" : undefined} style={{ width: `${Math.max(2, (prices.progress ?? 0) * 100)}%` }} />
            <div className="track-end" />
          </div>
          <div className="tiny subtle" style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span>Reference</span>
            <span>Trigger</span>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-label">Reference</div>
            <div className="stat-value num">{prices.reference}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Trigger</div>
            <div className="stat-value num">{prices.trigger}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Distance</div>
            <div className="stat-value num">{prices.distance ?? "—"}</div>
          </div>
        </div>
      </div>

      {health.state !== "live" || offline ? (
        <div role="status" className="notice" data-tone="warn" style={{ marginTop: 12 }}>
          <Alert className="notice-icon" />
          <div>
            <strong>{offline ? "Connection to Watchman lost" : health.title}</strong>
            <span className="muted">{offline ? "This page can’t reach Watchman right now. Protection state is kept on the server; this view will catch up when it reconnects." : health.detail}</span>
          </div>
        </div>
      ) : null}

      <div className="card card-pad enter-3" style={{ marginTop: 12 }}>
        <div className="eyebrow">Watchman’s authority</div>
        <dl className="rows" style={{ margin: "12px 0 0" }}>
          <div className="row">
            <dt>May sell</dt>
            <dd className="num">
              Up to {authority.maxSellEth} ETH <span className="subtle">({view.terms.sell})</span>
            </dd>
          </div>
          <div className="row">
            <dt>For</dt>
            <dd>USDC on Base</dd>
          </div>
          <div className="row">
            <dt>Only if</dt>
            <dd className="num">ETH ≤ {prices.trigger}</dd>
          </div>
          <div className="row">
            <dt>Through</dt>
            <dd>
              PayBox · {authority.credentialName}
              {authority.wallet ? <span className="subtle mono"> {authority.wallet}</span> : null}
            </dd>
          </div>
          {authority.approvalLabel ? (
            <div className="row">
              <dt>On trigger</dt>
              <dd title={authority.approvalDetail ?? undefined}>{authority.approvalLabel}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {demo ? (
        <div className="card card-pad" style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", maxWidth: 340 }}>
            <Info size={18} className="subtle" />
            <div className="small muted">
              <strong style={{ color: "var(--text)", fontWeight: 600 }}>Demo market.</strong> Moves the simulated ETH price down 13% over ten seconds. Everything after that is Watchman acting on its own.
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => void simulateDrop()} disabled={dropping || dropped}>
            {dropping ? <Spinner /> : null}
            {dropped ? "Market falling" : "Simulate market drop"}
          </button>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="notice" data-tone="bad" style={{ marginTop: 12 }}>
          <Alert className="notice-icon" />
          <div>
            <strong>That didn’t go through</strong>
            <span className="muted">{error.message}</span>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Activity events={view.events} />
      </div>

      <button type="button" className="btn btn-danger btn-block" style={{ marginTop: 24 }} onClick={() => setConfirming(true)}>
        Revoke Protection
      </button>

      <dialog ref={dialog} className="sheet" aria-labelledby="revoke-title" onClose={() => setConfirming(false)}>
        <h2 id="revoke-title" className="title-sm" style={{ fontSize: 19 }}>
          Revoke this protection?
        </h2>
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          Watchman stops monitoring immediately and can never execute this policy. Your ETH stays where it is. This can’t be undone.
        </p>
        <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
          <button type="button" className="btn btn-danger-solid btn-block" onClick={() => void revoke()} disabled={revoking}>
            {revoking ? <Spinner /> : null} Revoke Protection
          </button>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => setConfirming(false)} disabled={revoking} autoFocus>
            Keep protecting
          </button>
        </div>
      </dialog>
    </section>
  );
}
