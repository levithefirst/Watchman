"use client";

import { useEffect, useState } from "react";
import { track } from "./analytics";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/protect", label: "Protection" },
  { href: "/hedges", label: "Hedge receipts" },
];

export default function SiteHeader({
  variant = "landing",
}: {
  /** "landing" links to page anchors; "app" links across product pages. */
  variant?: "landing" | "app";
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setStuck(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile sheet on Escape, and lock scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const links = variant === "app" ? [{ href: "/", label: "Home" }, ...LINKS.slice(1)] : LINKS;

  return (
    <header
      className={`sticky top-0 z-50 border-b-[3px] border-ink bg-paper/95 backdrop-blur-sm transition-shadow ${
        stuck ? "shadow-[0_4px_0_0_#111]" : ""
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <a
          href="/"
          className="group flex items-center gap-2.5 no-underline"
          aria-label="Watchman home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-lg border-[3px] border-ink bg-pink shadow-[3px_3px_0_0_#111] transition-transform group-hover:rotate-[-6deg]">
            <span className="block h-2.5 w-2.5 rounded-full bg-ink" />
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">WATCHMAN</span>
        </a>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-bold text-ink no-underline decoration-[3px] underline-offset-[6px] hover:underline"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <a
            href="/protect"
            onClick={() => track("cta_clicked", { location: "header", label: "try_demo" })}
            className="wm-press group hidden items-center gap-2 rounded-xl bg-yellow px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-ink no-underline sm:inline-flex"
          >
            Try demo
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="wm-mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="wm-press grid h-11 w-11 place-items-center rounded-xl bg-white md:hidden"
          >
            <span className="relative block h-3.5 w-5">
              <span
                className={`absolute left-0 block h-[3px] w-5 rounded bg-ink transition-transform ${
                  open ? "top-1.5 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 top-1.5 block h-[3px] w-5 rounded bg-ink transition-opacity ${
                  open ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 block h-[3px] w-5 rounded bg-ink transition-transform ${
                  open ? "top-1.5 -rotate-45" : "top-3"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div id="wm-mobile-nav" className="border-t-[3px] border-ink bg-paper md:hidden">
          <nav aria-label="Mobile" className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
            <ul className="flex flex-col gap-1">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3.5 text-lg font-bold text-ink no-underline hover:bg-blue-pale"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="/protect"
              onClick={() => {
                track("cta_clicked", { location: "mobile_menu", label: "try_demo" });
                setOpen(false);
              }}
              className="wm-press mt-4 flex w-full items-center justify-center rounded-xl bg-yellow px-5 py-4 text-base font-bold uppercase tracking-wide text-ink no-underline"
            >
              Try demo
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
