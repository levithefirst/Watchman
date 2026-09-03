"use client";

import type { ReactNode } from "react";
import { ButtonLink } from "./ui";
import { track } from "./analytics";

/** Button-styled link that reports a `cta_clicked` analytics event. */
export default function CtaLink({
  href,
  children,
  location,
  label,
  tone = "yellow",
  size = "md",
  full = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  location: string;
  label: string;
  tone?: "yellow" | "pink" | "blue" | "white" | "ink";
  size?: "lg" | "md" | "sm";
  full?: boolean;
  className?: string;
}): React.ReactElement {
  return (
    <ButtonLink
      href={href}
      tone={tone}
      size={size}
      full={full}
      className={className}
      onClick={() => track("cta_clicked", { location, label })}
    >
      {children}
    </ButtonLink>
  );
}
