import type { ReactNode } from "react";
import { Panel } from "./ui";

/**
 * User-facing failure state. The headline stays human; the raw upstream
 * message (Prisma/SDK internals, HTTP codes) is tucked into a disclosure so
 * it's there when debugging without shouting schema details at a visitor.
 */
export default function ErrorState({
  title,
  detail,
  children,
  className = "",
}: {
  title: string;
  detail?: string;
  children?: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <Panel className={`p-7 sm:p-8 ${className}`}>
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border-[3px] border-ink bg-flame text-lg font-bold text-paper"
        >
          !
        </span>
        <div className="min-w-0 flex-1">
          <p role="alert" className="text-lg font-bold">
            {title}
          </p>
          <p className="mt-2 text-base leading-7 text-ink-soft">
            Something upstream didn&apos;t respond as expected. Your data is safe — try again in a
            moment.
          </p>
          {detail ? (
            <details className="mt-4 rounded-xl border-[3px] border-ink bg-paper-deep px-4 py-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-ink-soft">
                Technical detail
              </summary>
              <p className="wm-numeral mt-3 break-words text-xs leading-5 text-ink-soft">{detail}</p>
            </details>
          ) : null}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </div>
    </Panel>
  );
}
