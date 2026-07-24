export type SortMode = "balanced" | "free" | "investor" | null;

interface SortRowProps {
  sortMode: SortMode;
  onBalanced: () => void;
  onInvestor: () => void;
}

/**
 * Visually a "Sort" control (matches the Modernist design), but it never
 * re-sorts anything client-side - get_dashboard_events already returned
 * the list in SQL score order. Each pill is a relabeled front-end for
 * filters that already exist and are already compliant: "Investor signal
 * first" is the Investor category filter, "Balanced" clears it. Free &
 * open filtering lives solely as the "Free & open only" chip in
 * FilterChips (same freeAndOpenOnly boolean) - "Balanced" correctly shows
 * unpressed whenever that chip is active, since sortMode derives to
 * "free" in that case regardless of which control set it.
 */
function SortRow({ sortMode, onBalanced, onInvestor }: SortRowProps) {
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
        className={`tag sort-pill${sortMode === "investor" ? " sort-pill--active" : ""}`}
        aria-pressed={sortMode === "investor"}
        onClick={onInvestor}
      >
        Investor signal first
      </button>
    </div>
  );
}

export default SortRow;
