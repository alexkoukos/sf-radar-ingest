const CATEGORY_LABELS: Record<string, string> = {
  INVESTOR_MEETUP: "Investor",
  HACKATHON: "Hackathon",
  DEMO_DAY: "Demo Day",
  FOUNDER_SOCIAL: "Founder Social",
  GENERAL_NETWORKING: "Networking",
  OTHER: "Other",
};

interface FilterChipsProps {
  categories: string[];
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  newcomerFriendlyOnly: boolean;
  onToggleNewcomerFriendly: () => void;
  freeAndOpenOnly: boolean;
  onToggleFreeAndOpen: () => void;
}

/**
 * Pure client-side filtering of the single already-fetched event list -
 * never a re-fetch. Category chips only render categories actually
 * present in the current window so there's never a chip with zero results
 * behind it.
 */
function FilterChips({
  categories,
  activeCategory,
  onCategoryChange,
  newcomerFriendlyOnly,
  onToggleNewcomerFriendly,
  freeAndOpenOnly,
  onToggleFreeAndOpen,
}: FilterChipsProps) {
  return (
    <div className="filter-chips" role="group" aria-label="Filter events">
      <button
        type="button"
        className={`chip${newcomerFriendlyOnly ? " chip--active" : ""}`}
        aria-pressed={newcomerFriendlyOnly}
        onClick={onToggleNewcomerFriendly}
      >
        Newcomer friendly
      </button>
      <button
        type="button"
        className={`chip${freeAndOpenOnly ? " chip--active" : ""}`}
        aria-pressed={freeAndOpenOnly}
        onClick={onToggleFreeAndOpen}
      >
        Free &amp; open only
      </button>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className={`chip${activeCategory === category ? " chip--active" : ""}`}
          aria-pressed={activeCategory === category}
          onClick={() => onCategoryChange(activeCategory === category ? null : category)}
        >
          {CATEGORY_LABELS[category] ?? category}
        </button>
      ))}
    </div>
  );
}

export default FilterChips;
