import { current, resolveMode, sessionId, viewOf } from "./lib/server";
import App from "./components/App";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ instruction?: string }> }): Promise<React.ReactElement> {
  const [ownerId, mode, params] = await Promise.all([sessionId(), resolveMode(), searchParams]);
  let view = null;
  try {
    const p = ownerId ? await current(ownerId) : null;
    view = p ? await viewOf(p) : null;
  } catch {
    // The client retries; the create screen still renders without the database.
  }
  const prefill = typeof params.instruction === "string" ? params.instruction.slice(0, 200) : "";
  return <App initialView={view} mode={mode.mode} prefill={prefill} />;
}
