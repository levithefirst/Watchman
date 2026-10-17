import type { ProtectionView } from "@watchman/core";
import { timeOf } from "./api";
import { External } from "./icons";

const TONE: Record<string, string> = {
  TRANSACTION_VERIFIED: "ok",
  PROTECTION_ARMED: "ok",
  TRIGGER_CROSSED: "warn",
  MONITORING_PAUSED: "warn",
  PAYBOX_APPROVAL_REQUIRED: "warn",
  PAYBOX_FUNDING_REQUIRED: "warn",
  EXECUTION_FAILED: "bad",
  NEEDS_REVIEW: "bad",
};

export function Timeline({ events }: { events: ProtectionView["events"] }): React.ReactElement {
  return (
    <ol className="timeline" aria-label="Audit trail">
      {events.map((e) => (
        <li key={e.id} data-tone={TONE[e.kind]}>
          <span className="tl-dot" aria-hidden="true" />
          <div style={{ minWidth: 0 }}>
            <div className="tl-title">{e.title}</div>
            <div className="tl-msg">
              {e.message}
              {e.txUrl ? (
                <>
                  {" "}
                  <a className="link" href={e.txUrl} target="_blank" rel="noreferrer">
                    View on Basescan <External size={12} />
                  </a>
                </>
              ) : null}
            </div>
          </div>
          <time dateTime={e.at} className="num">
            {timeOf(e.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

export function Activity({ events, open = false }: { events: ProtectionView["events"]; open?: boolean }): React.ReactElement {
  return (
    <details className="disclosure card card-pad" open={open}>
      <summary>
        <span style={{ fontWeight: 600 }}>Audit trail</span>
        <span className="small subtle" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {events.length} events
          <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div style={{ marginTop: 12 }}>
        <Timeline events={events} />
      </div>
    </details>
  );
}
