"use client";

import type { ProtectionView } from "@watchman/core";
import { Arrow } from "./icons";

export type Preview = { price: string; trigger: string; sources: string };

export function Confirm({ view, preview, onEdit, onArm }: { view: ProtectionView; preview: Preview | null; onEdit: () => void; onArm: () => void }): React.ReactElement {
  return (
    <section aria-labelledby="confirm-title">
      <button type="button" className="btn btn-ghost enter" style={{ marginLeft: -10 }} onClick={onEdit}>
        <Arrow /> Edit
      </button>
      <h1 id="confirm-title" className="title-sm enter" style={{ marginTop: 12 }}>
        Here’s exactly what Watchman will do.
      </h1>
      <p className="lede enter" style={{ fontSize: 15 }}>
        Compiled from “{view.instruction.replace(/[.!\s]+$/, "")}.” Nothing is active until you grant permission.
      </p>

      <div className="card card-pad enter-2" style={{ marginTop: 24 }}>
        <div className="clause">
          <span className="clause-key">WHEN</span>
          <span className="clause-value">ETH falls {view.terms.drop}</span>
        </div>
        <div className="clause">
          <span className="clause-key">THEN</span>
          <span className="clause-value">Sell {view.terms.sell} of ETH</span>
        </div>
        <div className="clause">
          <span className="clause-key">TO</span>
          <span className="clause-value">USDC</span>
        </div>
        <div className="clause">
          <span className="clause-key">ON</span>
          <span className="clause-value">Base</span>
        </div>
      </div>

      <div className="card card-pad enter-3" style={{ marginTop: 12 }}>
        <dl className="rows" style={{ margin: 0 }}>
          <div className="row">
            <dt>Maximum authority</dt>
            <dd>{view.terms.sell} of your ETH</dd>
          </div>
          <div className="row">
            <dt>Current ETH price</dt>
            <dd className="num">{preview ? preview.price : <span className="subtle">Captured when armed</span>}</dd>
          </div>
          <div className="row">
            <dt>Trigger at this price</dt>
            <dd className="num">{preview ? preview.trigger : <span className="subtle">{view.terms.drop} below reference</span>}</dd>
          </div>
        </dl>
        <p className="tiny subtle" style={{ margin: "14px 0 0" }}>
          {view.mode === "DEMO"
            ? "The reference price is captured the moment you arm. In demo mode it starts from the live price and then follows a simulated market."
            : `The reference price is captured the moment you arm${preview ? `, from ${preview.sources}` : ""}. The policy can’t change after that.`}
        </p>
      </div>

      <div className="enter-3" style={{ display: "grid", gap: 10, marginTop: 24 }}>
        <button type="button" className="btn btn-primary btn-block" onClick={onArm}>
          Arm Protection
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={onEdit}>
          Edit
        </button>
      </div>
    </section>
  );
}
