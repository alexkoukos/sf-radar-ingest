import { useMemo, useState } from "react";
import {
  DEFAULT_MEETING_DURATION_MIN,
  isValidEventUrl,
  MEETING_TYPES,
  saveCustomEvent,
  type CustomEventDraft,
  type CustomEventKind,
  type CustomEventVisibility,
  type MeetingType,
} from "../lib/customEvent";
import { isoPlusMinutes, laWallClockToIso } from "../lib/laTime";
import type { OwnedCustomEvent } from "../lib/groupMerge";

const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  coffee: "Coffee",
  one_on_one: "1:1",
  call: "Call",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  drinks: "Drinks",
  walk: "Walk",
  on_site: "On site",
  other: "Other",
};

const VIS_HELP: Record<CustomEventVisibility, string> = {
  shared: "Everyone in the group sees the full details.",
  busy: "The group sees only that you're unavailable. No title, no name, no company.",
  private: "Only you see this. It stays off the group view entirely.",
};

/** SF-local "YYYY-MM-DD" / "HH:mm" split out of an ISO instant, for editing. */
function splitLaWallClock(iso: string): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(iso))) if (p.type !== "literal") parts[p.type] = p.value;
  const hh = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hh}:${parts.minute}` };
}

interface Props {
  planSlug: string;
  editKey: string;
  windowStart: string;
  windowEnd: string;
  existing?: OwnedCustomEvent | null;
  onSaved: () => void;
  onCancel: () => void;
}

function CustomEventForm({
  planSlug,
  editKey,
  windowStart,
  windowEnd,
  existing,
  onSaved,
  onCancel,
}: Props) {
  const ex = existing?.custom;
  const exStart = ex ? splitLaWallClock(ex.starts_at) : null;
  const exEnd = ex?.ends_at ? splitLaWallClock(ex.ends_at) : null;

  const [kind, setKind] = useState<CustomEventKind>(
    ex?.kind === "meeting" ? "meeting" : ex?.kind === "generic" ? "generic" : "meeting",
  );
  const [visibility, setVisibility] = useState<CustomEventVisibility>(
    ex?.visibility === "shared" || ex?.visibility === "busy"
      ? ex.visibility
      : kind === "meeting"
        ? "busy"
        : "shared",
  );
  const [visTouched, setVisTouched] = useState(Boolean(ex));

  const [title, setTitle] = useState(ex?.title ?? "");
  const [date, setDate] = useState(exStart?.date ?? windowStart);
  const [startTime, setStartTime] = useState(exStart?.time ?? "18:00");
  const [endTime, setEndTime] = useState(exEnd?.time ?? "");
  const [location, setLocation] = useState(ex?.location ?? "");
  const [url, setUrl] = useState(ex?.url ?? "");
  const [note, setNote] = useState(ex?.note ?? "");
  const [withName, setWithName] = useState(ex?.with_name ?? "");
  const [withCompany, setWithCompany] = useState(ex?.with_company ?? "");
  const [meetingType, setMeetingType] = useState<MeetingType>(
    (ex?.meeting_type as MeetingType) ?? "coffee",
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMeeting = kind === "meeting";

  function switchKind(next: CustomEventKind) {
    setKind(next);
    if (!visTouched) setVisibility(next === "meeting" ? "busy" : "shared");
  }

  const titlePlaceholder = useMemo(
    () => (isMeeting ? "e.g. Coffee with Sarah Chen (leave blank and we name it)" : "e.g. Group dinner"),
    [isMeeting],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    const startsAt = laWallClockToIso(date, startTime);
    if (!startsAt) {
      setError("Enter a valid date and start time.");
      return;
    }
    let endsAt: string | null = null;
    if (endTime) {
      endsAt = laWallClockToIso(date, endTime);
      if (endsAt && endsAt <= startsAt) {
        setError("End time must be after the start time.");
        return;
      }
    } else if (isMeeting) {
      endsAt = isoPlusMinutes(startsAt, DEFAULT_MEETING_DURATION_MIN);
    }
    if (!isMeeting && !title.trim()) {
      setError("Give the event a title.");
      return;
    }
    if (url.trim() && !isValidEventUrl(url)) {
      setError("Enter a full link starting with http:// or https://");
      return;
    }

    const draft: CustomEventDraft = {
      eventId: ex?.event_id ?? null,
      kind,
      visibility,
      title,
      startsAt,
      endsAt,
      location,
      note,
      url,
      withName,
      withCompany,
      meetingType: isMeeting ? meetingType : null,
    };

    setBusy(true);
    try {
      await saveCustomEvent(planSlug, editKey, draft);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
      setBusy(false);
    }
  }

  return (
    <form className="ce-form" onSubmit={submit}>
      <div className="ce-form__head">
        <strong>{ex ? "Edit" : "Add"} on your plan</strong>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <fieldset className="ce-form__kind">
        <legend>Type</legend>
        <label className="radio">
          <input
            type="radio"
            name="ce-kind"
            checked={kind === "meeting"}
            onChange={() => switchKind("meeting")}
          />
          <span className="dot" aria-hidden="true" />
          <span>Meeting / 1:1</span>
        </label>
        <label className="radio">
          <input
            type="radio"
            name="ce-kind"
            checked={kind === "generic"}
            onChange={() => switchKind("generic")}
          />
          <span className="dot" aria-hidden="true" />
          <span>Event</span>
        </label>
      </fieldset>

      <label className="ce-field">
        <span>Title{isMeeting ? " (optional)" : ""}</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={140}
          placeholder={titlePlaceholder}
        />
      </label>

      {isMeeting && (
        <div className="ce-form__meeting">
          <label className="ce-field">
            <span>Who with</span>
            <input
              className="input"
              value={withName}
              onChange={(e) => setWithName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Sarah Chen"
            />
          </label>
          <label className="ce-field">
            <span>Company (optional)</span>
            <input
              className="input"
              value={withCompany}
              onChange={(e) => setWithCompany(e.target.value)}
              maxLength={80}
            />
          </label>
          <label className="ce-field">
            <span>Kind</span>
            <select
              className="input"
              value={meetingType}
              onChange={(e) => setMeetingType(e.target.value as MeetingType)}
            >
              {MEETING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEETING_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="ce-form__when">
        <label className="ce-field">
          <span>Date (SF)</span>
          <input
            className="input"
            type="date"
            value={date}
            min={windowStart}
            max={windowEnd}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="ce-field">
          <span>Start (SF)</span>
          <input
            className="input"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className="ce-field">
          <span>End (optional)</span>
          <input
            className="input"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
      </div>
      {isMeeting && !endTime && (
        <p className="ce-form__hint text-muted">
          No end time → defaults to {DEFAULT_MEETING_DURATION_MIN} minutes.
        </p>
      )}

      <label className="ce-field">
        <span>Location (optional)</span>
        <input
          className="input"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={200}
        />
      </label>

      <label className="ce-field">
        <span>Link (optional)</span>
        <input
          className="input"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={500}
          placeholder="https://…  (Zoom, Partiful, booking page)"
        />
      </label>

      <label className="ce-field">
        <span>Note (optional)</span>
        <textarea
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
        />
      </label>

      <fieldset className="ce-form__vis">
        <legend>Who can see it</legend>
        {(["shared", "busy", "private"] as CustomEventVisibility[]).map((v) => (
          <label key={v} className="radio ce-form__vis-opt">
            <input
              type="radio"
              name="ce-vis"
              checked={visibility === v}
              onChange={() => {
                setVisibility(v);
                setVisTouched(true);
              }}
            />
            <span className="dot" aria-hidden="true" />
            <span>
              <strong>
                {v === "shared" ? "Shared" : v === "busy" ? "Busy only" : "Private"}
              </strong>
              {isMeeting && v === "busy" ? " (default for meetings)" : ""}
              {!isMeeting && v === "shared" ? " (default)" : ""}
              <br />
              <span className="text-muted">{VIS_HELP[v]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && <p className="banner banner--error ce-form__error">{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Saving…" : ex ? "Save changes" : "Add to my plan"}
      </button>
    </form>
  );
}

export default CustomEventForm;
