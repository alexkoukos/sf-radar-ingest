import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface DropdownProps {
  /** Text on the pill, e.g. "Filters (2)". */
  label: string;
  /** Accessible name for the panel. */
  panelLabel: string;
  /** Pill looks "on" (ink fill) - e.g. when filters are active. */
  active?: boolean;
  /** Which edge the desktop dropdown lines up with. */
  align?: "left" | "right";
  /** Wider panel for forms (Group & share). */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The one dropdown pattern on the page: a rounded pill that opens a panel.
 * On phones the panel is a bottom sheet over a dimmed backdrop; from 640px
 * it's a dropdown capped to the viewport, so it's always fully on screen.
 *
 * Closes on Escape, a tap outside, tabbing out, or the Done button - and
 * focus returns to the pill every time. Opening moves focus into the
 * panel so keyboard and screen-reader users land where the content is.
 */
function Dropdown({ label, panelLabel, active = false, align = "left", wide = false, className = "", children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      className={`dropdown dropdown--${align} ${className}`}
      ref={rootRef}
      onBlur={(e) => {
        // Tabbing past the last control closes it, like a native menu.
        if (open && e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`pill dropdown__button${active ? " dropdown__button--active" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <span className="chev" aria-hidden="true" />
      </button>

      {open && <div className="dropdown__backdrop" aria-hidden="true" onClick={() => close()} />}
      {open && (
        <div
          ref={panelRef}
          className={`dropdown__panel${wide ? " dropdown__panel--wide" : ""}`}
          id={panelId}
          role="dialog"
          aria-label={panelLabel}
          tabIndex={-1}
        >
          <div className="dropdown__content">{children}</div>
          <div className="dropdown__foot">
            <button type="button" className="btn btn-primary" onClick={() => close()}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dropdown;
