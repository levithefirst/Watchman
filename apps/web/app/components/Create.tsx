"use client";

import type { ProtectionView } from "@watchman/core";
import { useEffect, useRef, useState } from "react";
import { api, type ApiError } from "./api";
import type { Preview } from "./Confirm";
import { Alert, Spinner } from "./icons";

const EXAMPLE = "If ETH drops 10%, sell 25% of my ETH to USDC.";

export function Create({
  instruction,
  onChange,
  onCompiled,
}: {
  instruction: string;
  onChange: (text: string) => void;
  onCompiled: (view: ProtectionView, preview: Preview | null) => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus({ preventScroll: true });
  }, []);

  const submit = async () => {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await api<{ view: ProtectionView; preview: Preview | null }>("/api/protection/compile", { method: "POST", body: { instruction } });
    setBusy(false);
    if (r.ok) onCompiled(r.data.view, r.data.preview);
    else setError(r.error);
  };

  const unsupported = error && error.code !== "network" && !error.code.startsWith("http_") && error.code !== "active_exists";

  return (
    <section aria-labelledby="create-title">
      <h1 id="create-title" className="title enter">
        Protect your position while you’re away.
      </h1>
      <p className="lede enter-2">Give Watchman one tightly scoped exit rule. It can only do exactly what you authorize.</p>

      <form
        className="enter-3"
        style={{ marginTop: 32 }}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="instruction" className="sr-only">
          Protection rule
        </label>
        <div className="composer" data-invalid={unsupported ? "true" : "false"}>
          <textarea
            id="instruction"
            ref={field}
            value={instruction}
            rows={3}
            maxLength={200}
            placeholder={EXAMPLE}
            aria-invalid={unsupported ? true : undefined}
            aria-describedby={error ? "create-error" : "create-hint"}
            onChange={(e) => {
              onChange(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="composer-bar">
            <span id="create-hint" className="tiny subtle composer-hint">
              One asset · one trigger · one action
            </span>
            <button type="submit" className="btn btn-primary" disabled={!instruction.trim() || busy}>
              {busy ? (
                <>
                  <Spinner /> Compiling
                </>
              ) : (
                "Create Protection"
              )}
            </button>
          </div>
        </div>

        {error ? (
          <div id="create-error" role="alert" className="notice" data-tone={unsupported ? "warn" : "bad"} style={{ marginTop: 12 }}>
            <Alert className="notice-icon" />
            <div>
              <strong>{unsupported ? "Watchman can’t run that rule" : error.code === "active_exists" ? "You already have an active protection" : "Couldn’t create the protection"}</strong>
              <span className="muted">{error.message}</span>
            </div>
          </div>
        ) : null}

        {!instruction.trim() ? (
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="tiny subtle">Try</span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                onChange(EXAMPLE);
                field.current?.focus();
              }}
            >
              {EXAMPLE}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
