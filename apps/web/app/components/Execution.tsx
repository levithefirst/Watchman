"use client";

import type { ProtectionView } from "@watchman/core";
import { Alert, Check, Cross, External, Lock, Spinner } from "./icons";
import { Activity } from "./Timeline";

function StepIcon({ state }: { state: string }): React.ReactElement {
  if (state === "done") return <Check size={13} />;
  if (state === "active") return <Spinner size={13} />;
  if (state === "failed") return <Cross size={12} />;
  return <span className="dot" style={{ width: 5, height: 5, opacity: 0.6 }} />;
}

export function Execution({ view, offline }: { view: ProtectionView; offline: boolean }): React.ReactElement {
  const x = view.execution!;
  const needsUser = view.stage === "PENDING_APPROVAL" || view.stage === "PENDING_FUNDING" || x.headline.startsWith("Signature required");

  return (
    <section aria-labelledby="exec-title">
      <span className="pill enter" data-tone="warn">
        <span className="dot" />
        Triggered
      </span>
      <h1 id="exec-title" className="title enter" style={{ marginTop: 14 }}>
        Protection triggered
      </h1>
      <p className="lede enter-2" style={{ color: "var(--text)" }}>
        ETH reached <span className="num">{x.observedPrice ?? view.prices.trigger}</span>.
      </p>
      <p className="lede enter-2" style={{ marginTop: 4 }}>
        Selling {view.terms.sell} of your ETH for USDC.
      </p>

      <div className="card card-pad enter-3" style={{ marginTop: 24 }} aria-live="polite">
        <ol className="steps">
          {x.steps.map((s) => (
            <li key={s.key} className="step" data-state={s.state}>
              <span className="step-icon">
                <StepIcon state={s.state} />
              </span>
              <div>
                <div className="step-label">{s.label}</div>
                {s.note && s.state !== "pending" ? <div className="step-note">{s.note}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div role="status" className="notice" data-tone={needsUser ? "warn" : "accent"} style={{ marginTop: 12 }}>
        {needsUser ? <Alert className="notice-icon" /> : <Lock size={18} className="notice-icon" />}
        <div style={{ minWidth: 0 }}>
          <strong>{x.headline}</strong>
          <span className="muted">{x.detail}</span>
          {x.actionUrl ? (
            <div style={{ marginTop: 10 }}>
              <a className="link" href={x.actionUrl} target="_blank" rel="noreferrer">
                Open PayBox <External />
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {offline ? (
        <div role="status" className="notice" data-tone="warn" style={{ marginTop: 12 }}>
          <Alert className="notice-icon" />
          <div>
            <strong>Connection to Watchman lost</strong>
            <span className="muted">Execution continues on the server. This view catches up when it reconnects.</span>
          </div>
        </div>
      ) : null}

      <div className="card card-pad" style={{ marginTop: 12 }}>
        <dl className="rows" style={{ margin: 0 }}>
          <div className="row">
            <dt>Authorized maximum</dt>
            <dd className="num">
              {view.terms.sell} · {view.authority.maxSellEth} ETH
            </dd>
          </div>
          <div className="row">
            <dt>This order</dt>
            <dd className="num">{x.sellEth ? `${x.sellEth} ETH → USDC` : <span className="subtle">Sizing from your balance</span>}</dd>
          </div>
          <div className="row">
            <dt>Trigger price</dt>
            <dd className="num">{view.prices.trigger}</dd>
          </div>
          <div className="row">
            <dt>PayBox request</dt>
            <dd className="mono subtle" style={{ overflowWrap: "anywhere" }}>
              {x.requestId ?? "Not yet issued"}
            </dd>
          </div>
        </dl>
      </div>

      <div style={{ marginTop: 12 }}>
        <Activity events={view.events} />
      </div>
    </section>
  );
}
