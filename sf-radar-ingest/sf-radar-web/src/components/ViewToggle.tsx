interface ViewToggleProps {
  myPlanOnly: boolean;
  onToggleMyPlan: () => void;
  tonightOnly: boolean;
  onToggleTonight: () => void;
  seenOnly: boolean;
  onToggleSeenOnly: () => void;
  hiddenOnly: boolean;
  onToggleHiddenOnly: () => void;
}

/**
 * The VIEW row: "My Plan", "Tonight only", "Seen", "Hidden". All four are one
 * mutually-exclusive group (0 or 1 active, never more) - the XOR logic lives
 * in App.tsx alongside the selectedNight state this shares with NightStrip.
 * Kept as its own row, separate from the Sort pills, so it reads as a
 * distinct "view" control. Plain buttons (not native radio/.seg) because ARIA
 * radio groups assume exactly one option is always selected, which doesn't
 * fit a group where "none active" is the valid default.
 *
 * "Seen" filters to events the user has marked seen (they're dimmed inline
 * when this is off). "Hidden" filters to events the user has hidden, where
 * each card offers Unhide; hidden events are otherwise excluded from the
 * list. Both flags are localStorage-only (see lib/eventFlags.ts).
 */
function ViewToggle({
  myPlanOnly,
  onToggleMyPlan,
  tonightOnly,
  onToggleTonight,
  seenOnly,
  onToggleSeenOnly,
  hiddenOnly,
  onToggleHiddenOnly,
}: ViewToggleProps) {
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
      <button
        type="button"
        className={`tag tag-outline sort-pill${seenOnly ? " sort-pill--active" : ""}`}
        aria-pressed={seenOnly}
        onClick={onToggleSeenOnly}
      >
        Seen
      </button>
      <button
        type="button"
        className={`tag tag-outline sort-pill${hiddenOnly ? " sort-pill--active" : ""}`}
        aria-pressed={hiddenOnly}
        onClick={onToggleHiddenOnly}
      >
        Hidden
      </button>
    </div>
  );
}

export default ViewToggle;
