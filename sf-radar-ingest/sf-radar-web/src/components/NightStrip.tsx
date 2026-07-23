import type { DashboardEvent } from "../types";
import type { Night } from "../lib/timeBoundaries";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  day: "numeric",
});

export const STRONG_SCORE_THRESHOLD = 0.7;

interface NightStripProps {
  nights: Night[];
  eventsByNight: Map<number, DashboardEvent[]>;
  selected: number | null;
  onSelect: (index: number | null) => void;
}

function bestScore(events: DashboardEvent[] | undefined): number | null {
  if (!events || events.length === 0) return null;
  return Math.max(...events.map((e) => e.score ?? 0));
}

function strongCount(events: DashboardEvent[] | undefined): number {
  if (!events) return 0;
  return events.filter((e) => (e.score ?? 0) >= STRONG_SCORE_THRESHOLD).length;
}

/**
 * The signature visual: one cell per evening, colored by that night's best
 * score. Empty nights stay visibly hollow rather than looking broken.
 * Clicking a night filters the list below to it; clicking it again (or the
 * "Your Stay" pill) clears the filter back to the full window.
 */
function NightStrip({ nights, eventsByNight, selected, onSelect }: NightStripProps) {
  return (
    <div className="night-strip" role="tablist" aria-label="Nights of your stay">
      {nights.map((night) => {
        const events = eventsByNight.get(night.index);
        const score = bestScore(events);
        const conflicts = strongCount(events) >= 2;
        const isEmpty = score === null;
        const isSelected = selected === night.index;

        return (
          <button
            key={night.index}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`night-cell${isEmpty ? " night-cell--empty" : ""}${isSelected ? " night-cell--selected" : ""}`}
            style={isEmpty ? undefined : { backgroundColor: `rgba(170, 59, 255, ${0.18 + score! * 0.7})` }}
            onClick={() => onSelect(isSelected ? null : night.index)}
            disabled={isEmpty}
            title={isEmpty ? "No events this evening" : `Best score ${score!.toFixed(2)}`}
          >
            <span className="night-cell__day">{dayFormatter.format(night.start)}</span>
            <span className="night-cell__date">{dateFormatter.format(night.start)}</span>
            {conflicts && (
              <span className="night-cell__conflict" aria-label="Multiple strong picks tonight">
                ✦
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default NightStrip;
