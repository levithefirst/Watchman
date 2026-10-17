"use client";

import { useState } from "react";
import { api } from "../components/api";

export function OperatorForm({ operator }: { operator: boolean }): React.ReactElement {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (operator) {
    return (
      <div style={{ display: "grid", gap: 10, marginTop: 24 }}>
        <a className="btn btn-primary btn-block" href="/">Continue</a>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={async () => {
            await api("/api/operator", { method: "DELETE" });
            window.location.href = "/";
          }}
        >
          Return to demo mode
        </button>
      </div>
    );
  }

  return (
    <form
      style={{ marginTop: 24, display: "grid", gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await api("/api/operator", { method: "POST", body: { key } });
        setBusy(false);
        if (r.ok) window.location.href = "/";
        else setError(r.error.message);
      }}
    >
      <label htmlFor="key" className="small muted">Operator key</label>
      <div className="composer">
        <input
          id="key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ width: "100%", border: 0, background: "transparent", color: "var(--text)", font: "inherit", fontSize: 16, padding: "14px 16px", outline: "none" }}
        />
      </div>
      {error ? <p role="alert" className="small" style={{ color: "var(--bad)", margin: 0 }}>{error}</p> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={!key || busy}>Unlock live mode</button>
    </form>
  );
}
