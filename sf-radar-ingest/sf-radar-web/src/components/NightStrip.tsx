import { useState, type CSSProperties } from "react";
import type { DashboardEvent } from "../types";
import type { Night } from "../lib/timeBoundaries";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});

export const STRONG_SCORE_THRESHOLD = 0.7;

interface NightStripProps {
  nights: Night[];
  eventsByNight: Map<number, DashboardEvent[]>;
  selected: number | null;
  onSelect: (index: number | null) => void;
  bookedNights: Set<number>;
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
 * The signature visual: one thin bar per evening, fill height (or a solid
 * "booked" fill) standing in for that night's best score. No date text is
 * baked into the bars themselves - hovering (desktop) or focusing/tapping
 * (mobile) surfaces the date in the label above instead. Clicking a night
 * filters the list below to it; clicking it again clears back to the full
 * window.
 */
function NightStrip({ nights, eventsByNight, selected, onSelect, bookedNights }: NightStripProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const labelIndex = hoverIndex ?? selected;
  const labelNight = labelIndex !== null ? nights.find((n) => n.index === labelIndex) : undefined;

  return (
    <div className="night-strip-wrap">
      <div className="night-strip__tooltip" aria-hidden="true">
        {labelNight ? `${dayFormatter.format(labelNight.start)} ${dateFormatter.format(labelNight.start)}` : " "}
      </div>
      <div className="night-strip" role="tablist" aria-label="Nights of your stay">
        {nights.map((night) => {
          const events = eventsByNight.get(night.index);
          const score = bestScore(events);
          const conflicts = strongCount(events) >= 2;
          const isBooked = bookedNights.has(night.index);
          const isEmpty = score === null && !isBooked;
          const isSelected = selected === night.index;
          const dateLabel = `${dayFormatter.format(night.start)} ${dateFormatter.format(night.start)}`;
          const statusLabel = isBooked ? "booked" : isEmpty ? "no events" : `best score ${score!.toFixed(2)}`;

          return (
            <button
              key={night.index}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={`${dateLabel} — ${statusLabel}`}
              className={`night-bar${isEmpty ? " night-bar--empty" : ""}${isSelected ? " night-bar--selected" : ""}${isBooked ? " night-bar--booked" : ""}`}
              style={!isEmpty && !isBooked ? ({ "--night-score": score } as CSSProperties) : undefined}
              onClick={() => onSelect(isSelected ? null : night.index)}
              onMouseEnter={() => setHoverIndex(night.index)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(night.index)}
              onBlur={() => setHoverIndex(null)}
              disabled={isEmpty}
            >
              {conflicts && (
                <span className="night-bar__conflict" aria-hidden="true">
                  ✦
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default NightStrip;
