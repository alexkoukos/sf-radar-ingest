import { useEffect, useId, useRef, useState } from "react";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { activeFilterCount, NO_FILTERS, type Filters } from "../lib/filters";

interface FilterMenuProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  /** Categories present this month, with how many events each has. */
  categories: Array<{ key: string; count: number }>;
  savedCount: number;
}

/**
 * The "Filters" button: one tap opens a panel of plain checkboxes, like a
 * shop's filter sidebar. Changes apply instantly (no Apply step to
 * remember). Closes on Escape, on a tap outside, or with the Done button.
 */
function FilterMenu({ filters, onChange, categories, savedCount }: FilterMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const count = activeFilterCount(filters);

  useEffect(() => {
    if (!open) return;
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

  function toggleCategory(key: string) {
    const has = filters.categories.includes(key);
    onChange({
      ...filters,
      categories: has ? filters.categories.filter((c) => c !== key) : [...filters.categories, key],
    });
  }

  return (
    <div className="filter" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`pill filter__button${count > 0 ? " filter__button--active" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        Filters{count > 0 ? ` (${count})` : ""}
        <span className="chev" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="filter__backdrop"
          aria-hidden="true"
          onClick={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
        />
      )}
      {open && (
        <div className="filter__panel" id={panelId} role="group" aria-label="Filters">
          <p className="filter__heading">Show only</p>
          <label className="check">
            <input
              type="checkbox"
              checked={filters.freeOnly}
              onChange={(e) => onChange({ ...filters, freeOnly: e.target.checked })}
            />
            <span>Free events anyone can join</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={filters.openOnly}
              onChange={(e) => onChange({ ...filters, openOnly: e.target.checked })}
            />
            <span>Open RSVP, no approval needed</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={filters.savedOnly}
              onChange={(e) => onChange({ ...filters, savedOnly: e.target.checked })}
            />
            <span>
              My saved events <span className="check__count">{savedCount}</span>
            </span>
          </label>

          {categories.length > 0 && (
            <>
              <p className="filter__heading">Type of event</p>
              {categories.map(({ key, count: n }) => (
                <label className="check" key={key}>
                  <input type="checkbox" checked={filters.categories.includes(key)} onChange={() => toggleCategory(key)} />
                  <span>
                    {CATEGORY_LABELS[key] ?? key} <span className="check__count">{n}</span>
                  </span>
                </label>
              ))}
            </>
          )}

          <div className="filter__foot">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={count === 0}
              onClick={() => onChange(NO_FILTERS)}
            >
              Clear all
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default FilterMenu;
