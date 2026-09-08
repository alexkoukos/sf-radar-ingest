import { useEffect, useMemo, useState } from "react";
import type { DashboardEvent } from "../types";
import type { TzMode } from "../lib/ics";
import { downloadPlanIcs } from "../lib/icsDownload";
import { normalizeDisplayName } from "../lib/displayName";
import { possessivePhrase } from "../lib/possessive";
import {
  feedUrls,
  getOrCreatePlanIdentity,
  peekEditKey,
  peekSlug,
  regeneratePlan,
  toSnapshot,
  upsertPlan,
  type PlanLoggedNight,
} from "../lib/plan";
import SubscribePanel from "./SubscribePanel";
import CopyField from "./CopyField";
import GroupHubSection from "./GroupHubSection";

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
  loggedNights: PlanLoggedNight[];
  startDate: string | null;
}

/**
 * The hub at the top of the page, directly under the header and above the
 * night list: three plain sections in a fixed order — GROUP (trip-group setup
 * / status), SHARE MY PLAN (the read-only /plan/<slug> link), CALENDAR
 * (subscribe URLs + .ics download, with the timezone format nested as a
 * secondary setting). It keeps its `id` as a stable anchor target.
 */
function PlanActions({ attendingEvents, loggedNights, startDate }: PlanActionsProps) {
  const [tzMode, setTzMode] = useState<TzMode>(loadTzMode);
  const [name, setName] = useState(loadName);
  const [toast, setToast] = useState<string | null>(null);

  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    const existing = peekSlug();
    if (existing && peekEditKey()) setShareSlug(existing);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TZ_KEY, tzMode);
    } catch {
      /* private browsing - non-fatal */
    }
  }, [tzMode]);

  const attendingSnapshot = useMemo(() => attendingEvents.map(toSnapshot), [attendingEvents]);
  const planSignature = useMemo(
    () => JSON.stringify({ a: attendingSnapshot, l: loggedNights, s: startDate }),
    [attendingSnapshot, loggedNights, startDate],
  );

  function publishPlan(slug: string): Promise<unknown> {
    const editKey = peekEditKey();
    if (!editKey) {
      return Promise.reject(new Error("This device can't edit this shared plan (no edit key)."));
    }
    return upsertPlan({
      slug,
      editKey,
      displayName: name.trim() || null,
      tzMode,
      startDate,
      attending: attendingSnapshot,
      logged: loggedNights,
    });
  }

  // Once a link exists, keep the published row current as the plan, name or
  // timezone mode changes - a subscribed calendar re-polls and sees the edit.
  useEffect(() => {
    if (!shareSlug) return;
    let cancelled = false;
    publishPlan(shareSlug).catch(() => {
      if (!cancelled) setShareError("Couldn't sync the latest changes to your share link.");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareSlug, name, tzMode, planSignature]);

  /** Publish and return {slug, editKey} — used by the GROUP section before create/join. */
  async function ensurePlanPublished(): Promise<{ slug: string; editKey: string }> {
    const identity = getOrCreatePlanIdentity();
    await publishPlan(identity.slug);
    const editKey = peekEditKey();
    if (!editKey) throw new Error("No plan edit key on this device.");
    if (!shareSlug) setShareSlug(identity.slug);
    if (identity.replacedLegacy) {
      setToast("Your earlier share link was replaced with a new one.");
      window.setTimeout(() => setToast(null), 4000);
    }
    return { slug: identity.slug, editKey };
  }

  async function handleShareClick() {
    setSharing(true);
    setShareError(null);
    try {
      const identity = getOrCreatePlanIdentity();
      await publishPlan(identity.slug);
      setShareSlug(identity.slug);
      if (identity.replacedLegacy) {
        setToast("Your earlier share link was replaced with a new one.");
        window.setTimeout(() => setToast(null), 4000);
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Couldn't create a share link.");
    } finally {
      setSharing(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setShareError(null);
    try {
      const newSlug = await regeneratePlan();
      setShareSlug(newSlug);
      setToast("New link generated — the old one no longer works.");
      window.setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Couldn't regenerate the link.");
    } finally {
      setRegenerating(false);
    }
  }

  function setNameValue(value: string) {
    setName(value);
    try {
      const n = value.trim();
      if (n) localStorage.setItem(NAME_KEY, n);
      else localStorage.removeItem(NAME_KEY);
    } catch {
      /* non-fatal */
    }
  }

  function handleDownload() {
    const withName = name.trim();
    const result = downloadPlanIcs(attendingEvents, {
      tzMode,
      calName: possessivePhrase(withName, "SF Radar plan"),
      filename: `${withName ? `${withName.replace(/[^\w-]+/g, "-")}-` : ""}sf-radar-plan.ics`,
    });
    setToast(
      result.ok
        ? `Downloaded ${result.count} event${result.count === 1 ? "" : "s"} — ${
            tzMode === "tzid" ? "SF timezone (TZID)" : "SF times as-is"
          }`
        : (result.error ?? "Export failed"),
    );
    window.setTimeout(() => setToast(null), 3500);
  }

  const count = attendingEvents.length;
  const sharePageUrl = shareSlug ? feedUrls(shareSlug).page : "";

  return (
    <details id="plan-hub" className="plan-hub">
      <summary className="plan-hub__summary">
        <span className="plan-hub__title">Group · Share · Calendar</span>
        <span className="plan-hub__hint text-muted">trip group, share link, calendar feed</span>
      </summary>
      <div className="plan-hub__body" aria-label="Group, share, and calendar">

      {/* ── GROUP ─────────────────────────────────────────────────────── */}
      <section className="hub-sec">
        <h3 className="hub-sec__title">Group</h3>
        <GroupHubSection
          ensurePlanPublished={ensurePlanPublished}
          startDate={startDate}
          name={name}
          onNameChange={setNameValue}
        />
      </section>

      {/* ── SHARE MY PLAN ─────────────────────────────────────────────── */}
      <section className="hub-sec">
        <h3 className="hub-sec__title">Share my plan</h3>

        <label className="hub-field hub-field--inline">
          <span>Shown as</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setNameValue(e.target.value)}
            maxLength={40}
            placeholder="your name (optional)"
          />
        </label>

        {shareSlug ? (
          <>
            <p className="hub__note text-muted">
              Anyone with this link sees a read-only copy of your plan. It stays in sync as you
              edit.
            </p>
            <CopyField label="Share link" value={sharePageUrl} />
            <div className="hub-form__actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                {regenerating ? "Regenerating…" : "Regenerate link"}
              </button>
            </div>
            <p className="hub__note text-muted">
              Editing rights stay on this browser only. If the link leaks, regenerate it — the old
              one stops working immediately.
            </p>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleShareClick}
            disabled={sharing}
          >
            {sharing ? "Creating link…" : "Create a share link"}
          </button>
        )}
        {shareError && <p className="banner banner--error hub__error">{shareError}</p>}
      </section>

      {/* ── CALENDAR ──────────────────────────────────────────────────── */}
      <section className="hub-sec">
        <h3 className="hub-sec__title">Calendar</h3>

        <div className="hub-form__actions">
          <button type="button" className="btn btn-primary" onClick={handleDownload}>
            Download .ics ({count} event{count === 1 ? "" : "s"})
          </button>
          {toast && (
            <span className="plan-actions__toast" role="status">
              {toast}
            </span>
          )}
        </div>

        {shareSlug ? (
          <SubscribePanel slug={shareSlug} />
        ) : (
          <p className="hub__note text-muted">
            Create a share link (above) to get a subscribe URL that keeps updating. The .ics
            download is a frozen copy of the plan as it is right now.
          </p>
        )}

        <details className="tz-toggle-wrap">
          <summary>
            Calendar time format —{" "}
            {tzMode === "tzid" ? "San Francisco timezone" : "SF times as-is"}
          </summary>
          <fieldset className="tz-toggle">
            <legend className="tz-toggle__legend">Applies to the download and the feed</legend>
            <label className="tz-toggle__opt radio">
              <input
                type="radio"
                name="tzmode"
                checked={tzMode === "tzid"}
                onChange={() => setTzMode("tzid")}
              />
              <span className="dot" aria-hidden="true" />
              <span>
                <strong>San Francisco timezone</strong> — events carry{" "}
                <code>America/Los_Angeles</code>. Correct instant everywhere; reminders fire right.
                Best if your calendar isn't already set to SF time.
              </span>
            </label>
            <label className="tz-toggle__opt radio">
              <input
                type="radio"
                name="tzmode"
                checked={tzMode === "floating"}
                onChange={() => setTzMode("floating")}
              />
              <span className="dot" aria-hidden="true" />
              <span>
                <strong>Show SF times as-is (ignores your timezone)</strong> — every app shows the
                literal SF wall-clock number. Simple to read, but not tied to a real moment.
              </span>
            </label>
          </fieldset>
        </details>
      </section>
      </div>
    </details>
  );
}

export default PlanActions;
