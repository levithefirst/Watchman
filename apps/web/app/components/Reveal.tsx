"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals children once on scroll-in. Motion is CSS-gated by
 * prefers-reduced-motion, and content is always in the DOM (never hidden from
 * assistive tech or crawlers) — only opacity/transform animate.
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}): React.ReactElement {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    // Anything already within (or above) the viewport on mount reveals at once,
    // so above-the-fold content never waits on a scroll that may not happen.
    if (node.getBoundingClientRect().top < window.innerHeight) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      // No negative bottom margin: an element resting in the last slice of a
      // fully-scrolled page must still reveal rather than stay hidden forever.
      { threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <As
      // `As` is a union of intrinsic tags whose ref types don't unify, but every
      // branch is an HTMLElement — all the observer needs. One contained cast.
      ref={ref as never}
      className={`wm-reveal ${shown ? "wm-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </As>
  );
}
