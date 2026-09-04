import type { ReactNode } from "react";

/* ------------------------------------------------------------------
   Watchman primitives. Presentational only, safe in server components.
   ------------------------------------------------------------------ */

type Tone = "yellow" | "pink" | "blue" | "white" | "ink";

const toneBg: Record<Tone, string> = {
  yellow: "bg-yellow text-ink",
  pink: "bg-pink text-ink",
  blue: "bg-blue text-ink",
  white: "bg-white text-ink",
  ink: "bg-ink text-paper",
};

export function Tag({
  children,
  tone = "pink",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}): React.ReactElement {
  return (
    <span className={`wm-tag px-4 py-2 text-xs ${toneBg[tone]} ${className}`}>{children}</span>
  );
}

/** Section eyebrow: small pink label that opens a section, poster-style. */
export function SectionLabel({
  children,
  tone = "pink",
}: {
  children: ReactNode;
  tone?: Tone;
}): React.ReactElement {
  return <Tag tone={tone}>{children}</Tag>;
}

export function Panel({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}): React.ReactElement {
  return <As className={`wm-panel ${className}`}>{children}</As>;
}

/* ---------- Buttons ---------- */

const sizeCls = {
  lg: "px-7 py-4 text-base sm:px-8 sm:py-5 sm:text-lg",
  md: "px-5 py-3 text-sm sm:text-base",
  sm: "px-4 py-2.5 text-sm",
} as const;

type ButtonSize = keyof typeof sizeCls;

function buttonClass(tone: Tone, size: ButtonSize, full: boolean, extra: string): string {
  return [
    "wm-press inline-flex items-center justify-center gap-2.5 rounded-2xl font-bold uppercase tracking-wide",
    "no-underline select-none",
    toneBg[tone],
    sizeCls[size],
    full ? "w-full" : "",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function ButtonLink({
  href,
  children,
  tone = "yellow",
  size = "md",
  full = false,
  className = "",
  ...rest
}: {
  href: string;
  children: ReactNode;
  tone?: Tone;
  size?: ButtonSize;
  full?: boolean;
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">): React.ReactElement {
  return (
    <a href={href} className={buttonClass(tone, size, full, className)} {...rest}>
      {children}
    </a>
  );
}

export function Button({
  children,
  tone = "yellow",
  size = "md",
  full = false,
  className = "",
  type = "button",
  ...rest
}: {
  children: ReactNode;
  tone?: Tone;
  size?: ButtonSize;
  full?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">): React.ReactElement {
  return (
    <button type={type} className={buttonClass(tone, size, full, className)} {...rest}>
      {children}
    </button>
  );
}

/** Arrow that nudges on parent hover, used inside CTAs. */
export function Arrow(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 12"
      className="h-3 w-6 shrink-0 transition-transform duration-150 group-hover:translate-x-1"
      fill="none"
    >
      <path
        d="M0 6h21M16 1l5 5-5 5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- Data display ---------- */

export function Stat({
  label,
  value,
  hint,
  tone = "white",
  className = "",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
}): React.ReactElement {
  return (
    <div className={`rounded-2xl border-[3px] border-ink p-5 ${toneBg[tone]} ${className}`}>
      <p className="wm-eyebrow text-ink-mute">{label}</p>
      <p className="wm-numeral mt-2 text-2xl font-bold sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-sm font-medium text-ink-soft">{hint}</p> : null}
    </div>
  );
}

/** Key/value row used in quote panels and receipts. */
export function Row({
  label,
  value,
  strong = false,
}: {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className={`text-sm ${strong ? "font-bold text-ink" : "font-medium text-ink-soft"}`}>
        {label}
      </dt>
      <dd className={`wm-numeral text-right ${strong ? "text-xl font-bold" : "text-base font-bold"}`}>
        {value}
      </dd>
    </div>
  );
}

export function StatusPill({ status }: { status: string }): React.ReactElement {
  const s = status.toUpperCase();
  const tone =
    s === "REDEEMED" || s === "SETTLED"
      ? "bg-mint"
      : s === "FAILED"
        ? "bg-flame text-paper"
        : s === "SETTLING"
          ? "bg-yellow"
          : "bg-white";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border-[3px] border-ink px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${tone}`}
    >
      {s}
    </span>
  );
}

/** Amber basis-risk note. Honesty is part of the product, so it is never hidden. */
export function BasisNote({ className = "" }: { className?: string }): React.ReactElement {
  return (
    <p
      className={`rounded-2xl border-[3px] border-ink bg-yellow/60 p-4 text-sm font-medium leading-6 ${className}`}
    >
      <strong className="font-bold">A hedge is not a promise.</strong> Event Contracts are binary
      outcomes, not perfect puts. The payout can differ from the exact loss on your position, and
      Watchman always shows that difference.
    </p>
  );
}
