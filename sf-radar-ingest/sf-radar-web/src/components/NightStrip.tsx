import type { CSSProperties } from "react";
import type { DashboardEvent } from "../types";
import type { Night } from "../lib/timeBoundaries";

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "narrow",
});
const dayOfMonthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  day: "numeric",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "short",
  day: "numeric",
});

export const STRONG_SCORE_THRESHOLD = 0.7;

// Real best-of-night scores cluster high (most nights have something above
// .8), so a raw 0-1 height makes every bar look full. Stretch the useful
// band onto the bar instead: display-only, never touches ranking.
const BAR_FLOOR = 0.5;
function barHeight(score: number): number {
  return Math.min(1, Math.max(0.08, (score - BAR_FLOOR) / (1 - BAR_FLOOR)));
}

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
 * The signature visual: one column per evening. Bar height = that night's
 * best score, so a strong night reads loud and a thin one reads quiet; a
 * booked night fills solid red with a check; an empty night is an outline
 * you can't tap. Weekday + date sit under every bar (recognition, not
 * recall), and a red mark flags nights with 2+ strong picks that collide.
 * Tap a night to filter the list to it, tap again to go back to all nights.
 */
function NightStrip({ nights, eventsByNight, selected, onSelect, bookedNights }: NightStripProps) {
  return (
    <div className="night-strip-wrap">
      <div className="night-strip" role="group" aria-label="Nights of your stay">
        {nights.map((night) => {
          const events = eventsByNight.get(night.index);
          const score = bestScore(events);
          const conflicts = strongCount(events) >= 2;
          const isBooked = bookedNights.has(night.index);
          const isEmpty = score === null && !isBooked;
          const isSelected = selected === night.index;
          const count = events?.length ?? 0;
          const statusLabel = isBooked
            ? "in your plan"
            : isEmpty
              ? "no events"
              : `${count} event${count === 1 ? "" : "s"}, best score ${Math.round(score! * 100)}${conflicts ? ", several strong picks" : ""}`;

          return (
            <button
              key={night.index}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${fullDateFormatter.format(night.start)}, ${statusLabel}`}
              className={`night${isEmpty ? " night--empty" : ""}${isSelected ? " night--selected" : ""}${isBooked ? " night--booked" : ""}${conflicts ? " night--conflict" : ""}`}
              onClick={() => onSelect(isSelected ? null : night.index)}
              disabled={isEmpty}
            >
              <span className="night__bar" aria-hidden="true">
                <span
                  className="night__fill"
                  style={!isEmpty ? ({ "--night-score": isBooked ? 1 : barHeight(score!) } as CSSProperties) : undefined}
                />
                {isBooked && <span className="night__check">✓</span>}
              </span>
              <span className="night__dow" aria-hidden="true">{weekdayFormatter.format(night.start)}</span>
              <span className="night__day" aria-hidden="true">{dayOfMonthFormatter.format(night.start)}</span>
            </button>
          );
        })}
      </div>
      <p className="night-legend" aria-hidden="true">
        <span><i className="night-legend__key night-legend__key--score" /> taller = better night</span>
        <span><i className="night-legend__key night-legend__key--booked" /> planned</span>
        <span><i className="night-legend__key night-legend__key--conflict" /> clash</span>
      </p>
    </div>
  );
}

export default NightStrip;
