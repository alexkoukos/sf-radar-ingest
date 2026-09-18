import { dayOptionLabel, monthLabel } from "../lib/dayKeys";

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
  freeOnly: boolean;
  onFreeOnlyChange: (value: boolean) => void;
}

/**
 * The only control on the page: which day, and whether to show only free,
 * open events. Native selects on purpose - every phone already knows how
 * to operate them, they're keyboard and screen-reader friendly for free,
 * and they never surprise anyone. Days with no events aren't offered, so
 * every choice leads somewhere.
 */
function DatePicker({
  months,
  month,
  onMonthChange,
  days,
  day,
  onDayChange,
  today,
  freeOnly,
  onFreeOnlyChange,
}: DatePickerProps) {
  return (
    <fieldset className="picker">
      <legend className="sr-only">Choose a date</legend>
      <div className="picker__row">
        <label className="picker__field">
          <span className="picker__label">Month</span>
          <select
            className="input picker__select"
            name="month"
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="picker__field">
          <span className="picker__label">Day</span>
          <select
            className="input picker__select"
            name="day"
            value={day}
            onChange={(e) => onDayChange(e.target.value)}
          >
            <option value={ANY_DAY}>Any day</option>
            {days.map(({ key, count }) => (
              <option key={key} value={key}>
                {dayOptionLabel(key)}
                {key === today ? " (today)" : ""} · {count} {count === 1 ? "event" : "events"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="picker__check">
        <input type="checkbox" checked={freeOnly} onChange={(e) => onFreeOnlyChange(e.target.checked)} />
        <span>Only free events anyone can join</span>
      </label>
    </fieldset>
  );
}

export default DatePicker;
