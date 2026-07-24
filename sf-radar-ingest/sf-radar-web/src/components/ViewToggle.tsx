interface ViewToggleProps {
  myPlanOnly: boolean;
  onToggleMyPlan: () => void;
  tonightOnly: boolean;
  onToggleTonight: () => void;
}

/**
 * "My Plan" and "Tonight only" are mutually exclusive (0 or 1 active, never
 * both) - the XOR logic lives in App.tsx alongside the selectedNight state
 * this shares with NightStrip. Kept as its own row, separate from the Sort
 * pills, so it reads as a distinct "view" control rather than a 4th/5th
 * sort pill. Plain buttons (not native radio/.seg) because ARIA radio
 * groups assume exactly one option is always selected, which doesn't fit
 * a toggle pair where "neither active" is a valid, default state.
 */
function ViewToggle({ myPlanOnly, onToggleMyPlan, tonightOnly, onToggleTonight }: ViewToggleProps) {
  return (
    <div className="view-toggle" role="group" aria-label="View">
      <span className="view-toggle__label">View</span>
      <button
        type="button"
        className={`tag tag-outline sort-pill${myPlanOnly ? " sort-pill--active" : ""}`}
        aria-pressed={myPlanOnly}
        onClick={onToggleMyPlan}
      >
        My Plan
      </button>
      <button
        type="button"
        className={`tag tag-outline sort-pill${tonightOnly ? " sort-pill--active" : ""}`}
        aria-pressed={tonightOnly}
        onClick={onToggleTonight}
      >
        Tonight only
      </button>
    </div>
  );
}

export default ViewToggle;
