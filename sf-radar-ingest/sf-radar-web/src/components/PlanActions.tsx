import { useEffect, useState } from "react";
import type { DashboardEvent } from "../types";
import type { TzMode } from "../lib/ics";
import { downloadPlanIcs } from "../lib/icsDownload";
import { normalizeDisplayName } from "../lib/displayName";
import { possessivePhrase } from "../lib/possessive";

const NAME_KEY = "sfradar:v1:displayName";
const TZ_KEY = "sfradar:v1:tzMode";

function loadName(): string {
  try {
    return normalizeDisplayName(localStorage.getItem(NAME_KEY)) ?? "";
  } catch {
    return "";
  }
}
function loadTzMode(): TzMode {
  try {
    return localStorage.getItem(TZ_KEY) === "floating" ? "floating" : "tzid";
  } catch {
    return "tzid";
  }
}

interface PlanActionsProps {
  attendingEvents: DashboardEvent[];
}

/**
 * "Download .ics" for the user's own live plan, with the timezone-mode
 * choice (Change 1) and a display-name prompt (Change 2). The live
 * subscribe-able feed URL is added in the next stage.
 */
function PlanActions({ attendingEvents }: PlanActionsProps) {
  const [tzMode, setTzMode] = useState<TzMode>(loadTzMode);
  const [name, setName] = useState(loadName);
  const [nameDraft, setNameDraft] = useState("");
  const [askingName, setAskingName] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(TZ_KEY, tzMode);
    } catch {
      /* private browsing - non-fatal */
    }
  }, [tzMode]);

  function commitName(value: string): string {
    const normalized = normalizeDisplayName(value) ?? "";
    setName(normalized);
    try {
      if (normalized) localStorage.setItem(NAME_KEY, normalized);
      else localStorage.removeItem(NAME_KEY);
    } catch {
      /* non-fatal */
    }
    return normalized;
  }

  function runDownload(withName: string) {
    const calName = possessivePhrase(withName, "SF Radar plan");
    const result = downloadPlanIcs(attendingEvents, {
      tzMode,
      calName,
      filename: `${withName ? `${withName.replace(/[^\w-]+/g, "-")}-` : ""}sf-radar-plan.ics`,
    });
    setToast(
      result.ok
        ? `Downloaded ${result.count} event${result.count === 1 ? "" : "s"} — ${tzMode === "tzid" ? "SF timezone (TZID)" : "SF times as-is"}`
        : result.error ?? "Export failed",
    );
    window.setTimeout(() => setToast(null), 3500);
  }

  function handleDownloadClick() {
    if (!name) {
      setNameDraft("");
      setAskingName(true);
      return;
    }
    runDownload(name);
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const committed = commitName(nameDraft);
    setAskingName(false);
    runDownload(committed); // empty name is allowed → falls back to "SF Radar plan"
  }

  return (
    <div className="plan-actions">
      <div className="plan-actions__row">
        <button type="button" className="btn btn-primary" onClick={handleDownloadClick}>
          Download .ics
        </button>
        {toast && (
          <span className="plan-actions__toast" role="status">
            {toast}
          </span>
        )}
      </div>

      <fieldset className="tz-toggle">
        <legend className="tz-toggle__legend">Calendar times</legend>
        <label className="tz-toggle__opt">
          <input
            type="radio"
            name="tzmode"
            checked={tzMode === "tzid"}
            onChange={() => setTzMode("tzid")}
          />
          <span>
            <strong>San Francisco timezone</strong> — events carry <code>America/Los_Angeles</code>.
            Correct instant everywhere; reminders fire right. Best if your calendar isn't already set
            to SF time.
          </span>
        </label>
        <label className="tz-toggle__opt">
          <input
            type="radio"
            name="tzmode"
            checked={tzMode === "floating"}
            onChange={() => setTzMode("floating")}
          />
          <span>
            <strong>Show SF times as-is (ignores your timezone)</strong> — every app shows the literal
            SF wall-clock number. Simple to read, but not tied to a real moment.
          </span>
        </label>
      </fieldset>

      {name && (
        <p className="plan-actions__name text-muted">
          Sharing as <strong>{name}</strong>.{" "}
          <button type="button" className="btn btn-ghost plan-actions__name-edit" onClick={() => { setNameDraft(name); setAskingName(true); }}>
            Change name
          </button>
        </p>
      )}

      {askingName && (
        <form className="name-prompt" onSubmit={handleNameSubmit}>
          <label htmlFor="display-name">Your name (shown on shared plans — optional)</label>
          <div className="name-prompt__row">
            <input
              id="display-name"
              className="input"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={80}
              placeholder="e.g. Alekos"
              autoFocus
            />
            <button type="submit" className="btn btn-primary">
              Save &amp; download
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAskingName(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default PlanActions;
