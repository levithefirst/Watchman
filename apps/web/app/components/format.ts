/** Shared display formatting. Values arrive from the API as strings (Prisma Decimal) or numbers. */

export const num = (value: string | number | null | undefined): number => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const money = (value: string | number | null | undefined, maxFractionDigits = 2): string =>
  `$${num(value).toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits, minimumFractionDigits: 2 })}`;

/** Compact money for oversized display numbers: $10,000 not $10,000.00 */
export const moneyTight = (value: string | number | null | undefined): string =>
  `$${num(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const signedMoney = (value: string | number | null | undefined): string => {
  const n = num(value);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
};

export const pct = (value: string | number | null | undefined, digits = 2): string =>
  `${num(value).toFixed(digits)}%`;

export const cents = (value: string | number | null | undefined): string =>
  `${(num(value) * 100).toFixed(1)}¢`;

export const count = (value: string | number | null | undefined): string =>
  num(value).toLocaleString(undefined, { maximumFractionDigits: 0 });

/** "15 MIN" / "1 HOUR" from a seconds value. */
export const windowLabel = (seconds: number): string =>
  seconds === 3600 ? "1 HOUR" : `${Math.round(seconds / 60)} MIN`;

/** Protection pct arrives as a 0–1 fraction from the DB. */
export const protectionLabel = (value: string | number | null | undefined): string => {
  const n = num(value);
  return `${Math.round((n <= 1 ? n * 100 : n))}%`;
};

export const shortDate = (value: string | Date): string =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Human countdown to a future timestamp; "Expired" once passed. */
export const untilLabel = (value: string | Date): string => {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m left`;
  return `${Math.floor(hours / 24)}d left`;
};
