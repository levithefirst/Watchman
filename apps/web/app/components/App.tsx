"use client";

import type { Mode, ProtectionView } from "@watchman/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Chrome } from "./Chrome";
import { Confirm, type Preview } from "./Confirm";
import { Create } from "./Create";
import { Execution } from "./Execution";
import { Monitor } from "./Monitor";
import { Outcome } from "./Outcome";
import { Permission } from "./Permission";

type DraftStep = "confirm" | "permission";

/**
 * One protection, six screens. Which screen shows is a function of the
 * protection's server-side state; the only local state is where the user is
 * within an unarmed draft.
 */
export default function App({ initialView, mode, prefill }: { initialView: ProtectionView | null; mode: Mode; prefill: string }): React.ReactElement {
  const [view, setView] = useState<ProtectionView | null>(initialView);
  const [creating, setCreating] = useState(!initialView || (prefill !== "" && (initialView.status === "DRAFT" || isTerminal(initialView))));
  const [step, setStep] = useState<DraftStep>("confirm");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [instruction, setInstruction] = useState(prefill || initialView?.instruction || "");
  const [offline, setOffline] = useState(false);

  const polling = view && (view.status === "ARMED" || view.status === "EXECUTING") && view.stage !== "NEEDS_REVIEW";
  const interval = view?.mode === "DEMO" ? 1_000 : 4_000;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const r = await api("/api/protection");
    if (r.ok) {
      setOffline(false);
      setView(r.data.view);
    } else {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const loop = async () => {
      await refresh();
      if (!cancelled) timer.current = setTimeout(loop, interval);
    };
    timer.current = setTimeout(loop, interval);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [polling, interval, refresh]);

  let screen: React.ReactNode;

  if (creating || !view) {
    screen = (
      <Create
        instruction={instruction}
        onChange={setInstruction}
        onCompiled={(v, p) => {
          setView(v);
          setPreview(p);
          setStep("confirm");
          setCreating(false);
        }}
      />
    );
  } else if (view.status === "DRAFT") {
    screen =
      step === "confirm" ? (
        <Confirm view={view} preview={preview} onEdit={() => setCreating(true)} onArm={() => setStep("permission")} />
      ) : (
        <Permission view={view} onBack={() => setStep("confirm")} onArmed={(v) => setView(v)} />
      );
  } else if (view.status === "ARMED") {
    screen = <Monitor view={view} offline={offline} onChange={setView} />;
  } else if (view.status === "EXECUTING" && view.stage !== "NEEDS_REVIEW") {
    screen = <Execution view={view} offline={offline} />;
  } else {
    screen = (
      <Outcome
        view={view}
        onNew={() => {
          setInstruction("");
          setPreview(null);
          setCreating(true);
        }}
      />
    );
  }

  return <Chrome mode={view?.mode ?? mode}>{screen}</Chrome>;
}

function isTerminal(v: ProtectionView): boolean {
  return v.status === "COMPLETED" || v.status === "FAILED" || v.status === "REVOKED";
}
