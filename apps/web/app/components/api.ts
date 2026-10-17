import type { ProtectionView } from "@watchman/core";

export type ApiError = { code: string; message: string; manageUrl?: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

const OFFLINE: ApiError = { code: "network", message: "Watchman couldn't reach its server. Check your connection and try again — nothing was changed." };

export async function api<T = { view: ProtectionView | null }>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: ApiError }) | null;
    if (!res.ok || !data) return { ok: false, error: data?.error ?? { code: `http_${res.status}`, message: `Watchman's server answered ${res.status}. Nothing was changed; try again in a moment.` } };
    return { ok: true, data };
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

export function timeOf(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function dateTimeOf(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}
