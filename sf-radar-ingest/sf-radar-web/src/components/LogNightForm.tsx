import { useState, type FormEvent } from "react";
import type { Night } from "../lib/timeBoundaries";

const optionFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
});

interface LogNightFormProps {
  nights: Night[];
  defaultNightIndex: number;
  onAdd: (entry: { nightIndex: number; title: string; note: string }) => void;
  onCancel: () => void;
}

/**
 * Minimal inline form for a self-authored plan entry - not a ranked event,
 * just a personal note attached to a night. Held in the same local plan as
 * the Attending toggles (see lib/localPlan.ts), never sent anywhere.
 */
function LogNightForm({ nights, defaultNightIndex, onAdd, onCancel }: LogNightFormProps) {
  const [nightIndex, setNightIndex] = useState(defaultNightIndex);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd({ nightIndex, title: trimmed, note: note.trim() });
  }

  return (
    <form className="log-night-form" onSubmit={handleSubmit}>
      <div className="field log-night-form__night">
        <label htmlFor="log-night-select">Night</label>
        <select
          id="log-night-select"
          className="input"
          value={nightIndex}
          onChange={(e) => setNightIndex(Number(e.target.value))}
        >
          {nights.map((n) => (
            <option key={n.index} value={n.index}>
              {optionFormatter.format(n.start)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="log-night-title">What are you doing?</label>
        <input
          id="log-night-title"
          className="input"
          placeholder="e.g. Dinner with a friend"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          required
        />
      </div>
      <div className="field">
        <label htmlFor="log-night-note">Note (optional)</label>
        <input
          id="log-night-note"
          className="input"
          placeholder="Address, time, anything to remember"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="log-night-form__actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Add to plan
        </button>
      </div>
    </form>
  );
}

export default LogNightForm;
