"use client";

import type { ProtectionView } from "@watchman/core";
import { dateTimeOf } from "./api";
import { Alert, Check, External, Minus } from "./icons";
import { Timeline } from "./Timeline";

function Mark({ tone, children }: { tone: "ok" | "bad" | "neutral"; children: React.ReactNode }): React.ReactElement {
  const bg = tone === "ok" ? "var(--ok-soft)" : tone === "bad" ? "var(--bad-soft)" : "var(--sunken)";
  const fg = tone === "ok" ? "var(--ok)" : tone === "bad" ? "var(--bad)" : "var(--text-2)";
  return (
    <span className="enter" style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 999, background: bg, color: fg }} aria-hidden="true">
      {children}
    </span>
  );
}

function Trail({ view }: { view: ProtectionView }): React.ReactElement {
  return (
    <div className="card card-pad enter-3" style={{ marginTop: 12 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Audit trail
      </div>
      <Timeline events={view.events} />
    </div>
  );
}

function NewProtection({ onNew }: { onNew: () => void }): React.ReactElement {
  return (
    <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 24 }} onClick={onNew}>
      Create new protection
    </button>
  );
}

export function Outcome({ view, onNew }: { view: ProtectionView; onNew: () => void }): React.ReactElement {
  if (view.status === "COMPLETED" && view.receipt) {
    const r = view.receipt;
    return (
      <section aria-labelledby="done-title">
        <Mark tone="ok">
          <Check size={22} />
        </Mark>
        <h1 id="done-title" className="title enter" style={{ marginTop: 18 }}>
          Protection executed
        </h1>
        <p className="lede enter-2">
          Watchman sold <span className="num">{r.soldEth} ETH</span> for <span className="num">{r.usdcReceived} USDC</span>
          {r.simulated ? " and verified the simulated settlement." : " and verified the result on Base."}
        </p>

        <div className="card card-pad enter-2" style={{ marginTop: 24 }}>
          <dl className="rows" style={{ margin: 0 }}>
            <div className="row">
              <dt>ETH sold</dt>
              <dd className="num">{r.soldEth} ETH</dd>
            </div>
            <div className="row">
              <dt>USDC received</dt>
              <dd className="num">{r.usdcReceived} USDC</dd>
            </div>
            <div className="row">
              <dt>Execution price</dt>
              <dd className="num">{r.executionPrice}</dd>
            </div>
            <div className="row">
              <dt>Trigger price</dt>
              <dd className="num">{r.triggerPrice}</dd>
            </div>
            <div className="row">
              <dt>Transaction</dt>
              <dd style={{ minWidth: 0 }}>
                {r.txUrl ? (
                  <a className="link mono" href={r.txUrl} target="_blank" rel="noreferrer">
                    {r.txHash!.slice(0, 10)}…{r.txHash!.slice(-8)} <External size={12} />
                  </a>
                ) : (
                  <span className="subtle">Simulated · no on-chain transaction</span>
                )}
              </dd>
            </div>
            <div className="row">
              <dt>Executed</dt>
              <dd className="num">{dateTimeOf(r.completedAt)}</dd>
            </div>
          </dl>
        </div>
        <Trail view={view} />
        <NewProtection onNew={onNew} />
      </section>
    );
  }

  if (view.status === "REVOKED") {
    return (
      <section aria-labelledby="revoked-title">
        <Mark tone="neutral">
          <Minus size={22} />
        </Mark>
        <h1 id="revoked-title" className="title enter" style={{ marginTop: 18 }}>
          Protection revoked
        </h1>
        <p className="lede enter-2">Watchman will take no further action on this policy. Your ETH was not touched.</p>
        {view.mode === "LIVE" ? (
          <p className="small muted enter-2" style={{ marginTop: 12 }}>
            Watchman’s PayBox grant still exists for future protections.{" "}
            <a className="link" href="https://app.paybox.sh" target="_blank" rel="noreferrer">
              Manage it in PayBox <External size={12} />
            </a>
          </p>
        ) : null}
        <Trail view={view} />
        <NewProtection onNew={onNew} />
      </section>
    );
  }

  const f = view.failure;
  const review = view.stage === "NEEDS_REVIEW";
  return (
    <section aria-labelledby="failed-title">
      <Mark tone="bad">
        <Alert size={22} />
      </Mark>
      <h1 id="failed-title" className="title enter" style={{ marginTop: 18 }}>
        Protection could not execute
      </h1>
      <p className="lede enter-2" style={{ color: "var(--text)", fontWeight: 550 }}>
        {f?.title}
      </p>
      <p className="lede enter-2" style={{ marginTop: 4 }}>
        {f?.message}
      </p>

      <div className="card card-pad enter-2" style={{ marginTop: 24 }}>
        <dl className="rows" style={{ margin: 0 }}>
          <div className="row">
            <dt>State</dt>
            <dd>{review ? "Stopped for review" : "Failed"}</dd>
          </div>
          <div className="row">
            <dt>Did funds move?</dt>
            <dd>{f?.fundsMoved}</dd>
          </div>
          <div className="row">
            <dt>PayBox request</dt>
            <dd className="mono subtle" style={{ overflowWrap: "anywhere" }}>
              {f?.requestId ?? "None issued"}
            </dd>
          </div>
          {f?.txUrl ? (
            <div className="row">
              <dt>Transaction</dt>
              <dd>
                <a className="link mono" href={f.txUrl} target="_blank" rel="noreferrer">
                  {f.txHash!.slice(0, 10)}…{f.txHash!.slice(-8)} <External size={12} />
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="notice enter-3" style={{ marginTop: 12 }}>
        <div>
          <strong>Next step</strong>
          <span className="muted">{f?.nextAction}</span>
        </div>
      </div>

      <Trail view={view} />
      <NewProtection onNew={onNew} />
    </section>
  );
}
