"use client";

import type { ProtectionView } from "@watchman/core";
import { useState } from "react";
import { api, type ApiError } from "./api";
import { Alert, Arrow, Check, Cross, External, Lock, Spinner } from "./icons";

export function Scope({ can, cannot }: { can: string[]; cannot: string[] }): React.ReactElement {
  return (
    <div className="scope">
      <div className="scope-col" data-kind="can">
        <div className="scope-head">
          <Check size={14} /> Watchman can
        </div>
        <ul aria-label="Watchman can">
          {can.map((item) => (
            <li key={item}>
              <Check size={15} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="scope-col" data-kind="cannot">
        <div className="scope-head">
          <Cross size={14} /> Watchman cannot
        </div>
        <ul aria-label="Watchman cannot">
          {cannot.map((item) => (
            <li key={item}>
              <Cross size={15} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PayboxAuthority({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <div className="authority">
      <span className="authority-mark" aria-hidden="true">
        <Lock size={18} />
      </span>
      <div>
        <div style={{ fontWeight: 620 }}>PayBox holds the authority</div>
        <div className="small muted" style={{ marginTop: 2 }}>
          Your wallet credentials stay protected by PayBox. Watchman receives only the authority you approve.
        </div>
        {children}
      </div>
    </div>
  );
}

export function Permission({ view, onBack, onArmed }: { view: ProtectionView; onBack: () => void; onArmed: (v: ProtectionView) => void }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const demo = view.mode === "DEMO";

  const grant = async () => {
    setBusy(true);
    setError(null);
    const r = await api<{ view: ProtectionView }>(`/api/protection/${view.id}/grant`, { method: "POST" });
    setBusy(false);
    if (r.ok) onArmed(r.data.view);
    else setError(r.error);
  };

  return (
    <section aria-labelledby="permission-title">
      <button type="button" className="btn btn-ghost enter" style={{ marginLeft: -10 }} onClick={onBack} disabled={busy}>
        <Arrow /> Back
      </button>
      <p className="eyebrow enter" style={{ marginTop: 12 }}>
        Permission
      </p>
      <h1 id="permission-title" className="title-sm enter" style={{ marginTop: 8 }}>
        Watchman needs permission to perform this one action.
      </h1>

      <div className="enter-2" style={{ marginTop: 24 }}>
        <Scope can={view.can} cannot={view.cannot} />
      </div>

      <div className="enter-3" style={{ marginTop: 12 }}>
        <PayboxAuthority>
          <dl className="rows small" style={{ margin: "14px 0 0" }}>
            <div className="row" style={{ padding: "10px 0" }}>
              <dt>Wallet</dt>
              <dd>{demo ? "Demo wallet · 2 ETH on Base" : "Your PayBox wallet on Base"}</dd>
            </div>
            <div className="row" style={{ padding: "10px 0" }}>
              <dt>When it triggers</dt>
              <dd>{demo ? "Pre-authorized within the grant" : "As your PayBox grant requires"}</dd>
            </div>
            <div className="row" style={{ padding: "10px 0 0" }}>
              <dt>Revocable</dt>
              <dd>Anytime</dd>
            </div>
          </dl>
        </PayboxAuthority>
      </div>

      {error ? (
        <div role="alert" className="notice" data-tone={error.code === "grant_required" ? "accent" : "bad"} style={{ marginTop: 16 }}>
          <Alert className="notice-icon" />
          <div style={{ minWidth: 0 }}>
            <strong>{error.code === "grant_required" ? "Grant Watchman access in PayBox" : "Permission wasn’t granted"}</strong>
            <span className="muted">{error.message}</span>
            {error.manageUrl ? (
              <div style={{ marginTop: 10 }}>
                <a className="link" href={error.manageUrl} target="_blank" rel="noreferrer">
                  Open PayBox <External />
                </a>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={() => void grant()} disabled={busy}>
          {busy ? (
            <>
              <Spinner /> Confirming with PayBox
            </>
          ) : error?.code === "grant_required" ? (
            "I’ve granted access — check again"
          ) : (
            "Grant Permission"
          )}
        </button>
        <p className="tiny subtle" style={{ textAlign: "center", margin: "12px 0 0" }}>
          {demo ? "Demo mode uses a simulated PayBox wallet. No real funds are involved." : "Watchman confirms its grant with PayBox and captures the reference price before arming."}
        </p>
      </div>
    </section>
  );
}
