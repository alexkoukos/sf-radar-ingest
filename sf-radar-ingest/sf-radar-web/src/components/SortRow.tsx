export type SortMode = "balanced" | "free" | "investor" | null;

interface SortRowProps {
  sortMode: SortMode;
  onBalanced: () => void;
  onFree: () => void;
  onInvestor: () => void;
  tonightOnly: boolean;
  onToggleTonight: () => void;
}

/**
 * Visually a "Sort" control (matches the Modernist design), but it never
 * re-sorts anything client-side - get_dashboard_events already returned
 * the list in SQL score order. Each pill is a relabeled front-end for
 * filters that already exist and are already compliant: "Free & open
 * first" is freeAndOpenOnly, "Investor signal first" is the Investor
 * category filter, "Balanced" clears both. "Tonight only" is a shortcut
 * for selecting night index 0 in the strip below.
 */
function SortRow({ sortMode, onBalanced, onFree, onInvestor, tonightOnly, onToggleTonight }: SortRowProps) {
  return (
    <div className="sort-row" role="group" aria-label="Sort">
      <span className="sort-row__label">Sort</span>
      <button
        type="button"
        className={`tag sort-pill${sortMode === "balanced" ? " sort-pill--active" : ""}`}
        aria-pressed={sortMode === "balanced"}
        onClick={onBalanced}
      >
        Balanced
      </button>
      <button
        type="button"
        className={`tag sort-pill${sortMode === "free" ? " sort-pill--active" : ""}`}
        aria-pressed={sortMode === "free"}
        onClick={onFree}
      >
        Free &amp; open first
      </button>
      <button
        type="button"
        className={`tag sort-pill${sortMode === "investor" ? " sort-pill--active" : ""}`}
        aria-pressed={sortMode === "investor"}
        onClick={onInvestor}
      >
        Investor signal first
      </button>
      <button
        type="button"
        className={`tag tag-outline sort-row__tonight${tonightOnly ? " sort-pill--active" : ""}`}
        aria-pressed={tonightOnly}
        onClick={onToggleTonight}
      >
        Tonight only
      </button>
    </div>
  );
}

export default SortRow;
