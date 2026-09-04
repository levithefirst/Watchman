"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Watchman-styled asset dropdown.
 *
 * A native <select> hands its option list to the operating system, which on
 * Android renders a full-bleed black sheet that ignores the site entirely.
 * This is the same control drawn in Watchman's own language, implemented as an
 * ARIA listbox so it keeps everything the native element gave us: keyboard
 * operation (arrows, Home/End, Enter, Escape), screen-reader semantics, and a
 * touch target big enough to hit.
 */
export default function AssetSelect<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (next: T) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.indexOf(value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // Keep the highlighted row in step with the committed value, so reopening
  // the list always starts on what is currently selected.
  useEffect(() => {
    setActive(Math.max(0, options.indexOf(value)));
  }, [value, options]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const commit = (index: number): void => {
    const next = options[index];
    if (next !== undefined) onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
      return;
    }
    if (event.key === "Tab") { setOpen(false); return; }

    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); commit(active); }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${value}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="wm-input flex w-full items-center justify-between gap-3 text-left"
      >
        <span>{value}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <svg width="16" height="10" viewBox="0 0 14 9" fill="none">
            <path d="M1 1l6 6 6-6" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          tabIndex={-1}
          className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border-[3px] border-ink bg-white p-1.5 shadow-[5px_5px_0_0_#111]"
        >
          {options.map((option, index) => {
            const selected = option === value;
            return (
              <li
                key={option}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(index)}
                className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3.5 text-base font-bold transition-colors ${
                  index === active ? "bg-yellow" : "bg-white"
                }`}
              >
                <span>{option}</span>
                {selected ? <span aria-hidden="true" className="text-sm font-bold">✓</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
