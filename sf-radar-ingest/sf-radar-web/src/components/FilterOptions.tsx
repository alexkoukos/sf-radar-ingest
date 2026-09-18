import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { activeFilterCount, NO_FILTERS, type Filters } from "../lib/filters";

interface FilterOptionsProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  /** Categories present this month, with how many events each has. */
  categories: Array<{ key: string; count: number }>;
  savedCount: number;
}

/**
 * The filter checkboxes themselves - plain labelled checkboxes, applied
 * instantly. Rendered inside the Filters dropdown.
 */
function FilterOptions({ filters, onChange, categories, savedCount }: FilterOptionsProps) {
  const count = activeFilterCount(filters);

  function toggleCategory(key: string) {
    const has = filters.categories.includes(key);
    onChange({
      ...filters,
      categories: has ? filters.categories.filter((c) => c !== key) : [...filters.categories, key],
    });
  }

  return (
    <div className="filter-options">
      <fieldset className="filter-options__group">
        <legend className="filter-options__heading">Show only</legend>
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
      </fieldset>

      {categories.length > 0 && (
        <fieldset className="filter-options__group">
          <legend className="filter-options__heading">Type of event</legend>
          {categories.map(({ key, count: n }) => (
            <label className="check" key={key}>
              <input type="checkbox" checked={filters.categories.includes(key)} onChange={() => toggleCategory(key)} />
              <span>
                {CATEGORY_LABELS[key] ?? key} <span className="check__count">{n}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <button
        type="button"
        className="btn btn-ghost filter-options__clear"
        disabled={count === 0}
        onClick={() => onChange(NO_FILTERS)}
      >
        Clear all filters
      </button>
    </div>
  );
}

export default FilterOptions;
