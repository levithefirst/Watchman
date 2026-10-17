import { resolveMode } from "../lib/server";
import { Chrome } from "../components/Chrome";
import { OperatorForm } from "./OperatorForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operator", robots: { index: false } };

export default async function OperatorPage(): Promise<React.ReactElement> {
  const { liveAvailable, operator } = await resolveMode();
  return (
    <Chrome mode={operator ? "LIVE" : "DEMO"}>
      <p className="eyebrow">Operator</p>
      <h1 className="title-sm" style={{ marginTop: 8 }}>
        {operator ? "Live mode is on for this browser." : "Unlock live mode"}
      </h1>
      <p className="lede" style={{ fontSize: 15 }}>
        {!liveAvailable
          ? "This deployment has no PayBox agent configured, so only demo mode is available. Set PAYBOX_API_KEY and WATCHMAN_OPERATOR_KEY to enable live protections."
          : operator
            ? "New protections from this browser will request real swaps through PayBox on Base mainnet."
            : "Live protections request real swaps through this deployment’s PayBox agent. Enter the operator key to continue."}
      </p>
      {liveAvailable ? <OperatorForm operator={operator} /> : null}
    </Chrome>
  );
}
