import type { ReactNode } from "react";
import { dayOptionLabel, monthPickerLabel } from "../lib/dayKeys";

export const ANY_DAY = "any";

interface DatePickerProps {
  /** Month keys ("YYYY-MM") that have at least one event, in order. */
  months: string[];
  month: string;
  onMonthChange: (month: string) => void;
  /** Day keys ("YYYY-MM-DD") in the chosen month that have events, with counts. */
  days: Array<{ key: string; count: number }>;
  day: string;
  onDayChange: (day: string) => void;
  today: string;
  /** Extra controls on the same row (the Filters button). */
  children?: ReactNode;
}

function dayText(day: string, days: DatePickerProps["days"], today: string): string {
  if (day === ANY_DAY) return "Any day";
  const hit = days.find((d) => d.key === day);
  return `${dayOptionLabel(day)}${day === today ? " (today)" : ""}${hit ? ` · ${hit.count}` : ""}`;
}

/**
 * One row of rounded controls: Month, Day, then whatever is passed in.
 * Native selects on purpose - every phone already knows how to operate
 * them, and they're keyboard and screen-reader friendly for free. The
 * visible text + arrow size the pill (a native select would size itself to
 * its longest option and push the arrow away); the real select lies on
 * top, transparent, so taps and keys still open the platform picker.
 * Days with no events aren't offered, so every choice leads somewhere.
 */
function DatePicker({ months, month, onMonthChange, days, day, onDayChange, today, children }: DatePickerProps) {
  return (
    <div className="controls" role="group" aria-label="Choose a date and filters">
      <label className="pill pill--select">
        <span className="sr-only">Month</span>
        <span className="pill__text" aria-hidden="true">{monthPickerLabel(month, today)}</span>
        <select className="pill__native" name="month" value={month} onChange={(e) => onMonthChange(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthPickerLabel(m, today)}
            </option>
          ))}
        </select>
        <span className="chev" aria-hidden="true" />
      </label>
      <label className="pill pill--select">
        <span className="sr-only">Day</span>
        <span className="pill__text" aria-hidden="true">{dayText(day, days, today)}</span>
        <select className="pill__native" name="day" value={day} onChange={(e) => onDayChange(e.target.value)}>
          <option value={ANY_DAY}>Any day</option>
          {days.map(({ key, count }) => (
            <option key={key} value={key}>
              {dayOptionLabel(key)}
              {key === today ? " (today)" : ""} · {count} {count === 1 ? "event" : "events"}
            </option>
          ))}
        </select>
        <span className="chev" aria-hidden="true" />
      </label>
      {children}
    </div>
  );
}

export default DatePicker;
