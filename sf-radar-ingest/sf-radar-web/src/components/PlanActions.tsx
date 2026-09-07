import { useEffect, useMemo, useState } from "react";
import type { DashboardEvent } from "../types";
import type { TzMode } from "../lib/ics";
import { downloadPlanIcs } from "../lib/icsDownload";
import { normalizeDisplayName } from "../lib/displayName";
import { possessivePhrase } from "../lib/possessive";
import {
  getOrCreatePlanIdentity,
  peekEditKey,
  peekSlug,
  regeneratePlan,
  toSnapshot,
  upsertPlan,
  type PlanLoggedNight,
} from "../lib/plan";
import SubscribePanel from "./SubscribePanel";

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
 * Export & share the user's own plan. Collapsed by default and rendered
 * BELOW the ranked list - you plan first, export after. "Download .ics" is
 * a frozen snapshot; "Create share link" publishes the plan to a
 * slug-keyed Supabase row (upsert_plan) and surfaces the /plan/<slug> page
 * plus the live calendar-feed URLs, which keep updating as the plan changes.
 */
function PlanActions({ attendingEvents, loggedNights, startDate }: PlanActionsProps) {
  const [tzMode, setTzMode] = useState<TzMode>(loadTzMode);
  const [name, setName] = useState(loadName);
  const [nameDraft, setNameDraft] = useState("");
  const [askingName, setAskingName] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(TZ_KEY, tzMode);
    } catch {
      /* private browsing - non-fatal */
    }
  }, [tzMode]);

  // Snapshot of exactly what a plan row stores - also the change signature
  // that drives the live re-publish below.
  const attendingSnapshot = useMemo(
    () => attendingEvents.map(toSnapshot),
    [attendingEvents],
  );
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
      displayName: name || null,
      tzMode,
      startDate,
      attending: attendingSnapshot,
      logged: loggedNights,
    });
  }

  // Once a link exists, keep the published row current as the plan, name or
  // timezone mode change - a subscribed calendar re-polls and sees the edit.
  useEffect(() => {
    if (!shareSlug) return;
    let cancelled = false;
    publishPlan(shareSlug).catch(() => {
      // Leave the existing link in place; the next explicit publish retries.
      if (!cancelled) setShareError("Couldn't sync the latest changes to your share link.");
    });
    return () => {
      cancelled = true;
    };
    // publishPlan closes over name/tzMode/snapshot; planSignature covers the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareSlug, name, tzMode, planSignature]);

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

  const count = attendingEvents.length;
  const shareLabel = sharing
    ? "Creating link…"
    : shareSlug || peekSlug()
      ? "Update share link"
      : "Create share link";

  return (
    <details className="plan-actions">
      <summary className="plan-actions__summary">
        <span className="plan-actions__summary-title">Export &amp; share this plan</span>
        <span className="plan-actions__summary-count">
          {count} event{count === 1 ? "" : "s"}
        </span>
      </summary>

      <div className="plan-actions__body">
        <div className="plan-actions__row">
          <button type="button" className="btn btn-primary" onClick={handleDownloadClick}>
            Download .ics
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleShareClick}
            disabled={sharing}
          >
            {shareLabel}
          </button>
          {toast && (
            <span className="plan-actions__toast" role="status">
              {toast}
            </span>
          )}
        </div>

        <fieldset className="tz-toggle">
          <legend className="tz-toggle__legend">Calendar times</legend>
          <label className="tz-toggle__opt radio">
            <input
              type="radio"
              name="tzmode"
              checked={tzMode === "tzid"}
              onChange={() => setTzMode("tzid")}
            />
            <span className="dot" aria-hidden="true" />
            <span>
              <strong>San Francisco timezone</strong> — events carry <code>America/Los_Angeles</code>.
              Correct instant everywhere; reminders fire right. Best if your calendar isn't already
              set to SF time.
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

        {name && (
          <p className="plan-actions__name text-muted">
            Sharing as <strong>{name}</strong>.{" "}
            <button
              type="button"
              className="btn btn-ghost plan-actions__name-edit"
              onClick={() => {
                setNameDraft(name);
                setAskingName(true);
              }}
            >
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
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAskingName(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {shareError && <p className="banner banner--error plan-actions__share-error">{shareError}</p>}

        {shareSlug && (
          <div className="plan-actions__share">
            <p className="plan-actions__share-lead">
              Anyone with this link sees a read-only copy of your plan. It stays in sync as you edit —
              re-open this panel any time to copy it again.
            </p>
            <SubscribePanel slug={shareSlug} includePageLink />
            <p className="plan-actions__share-lead text-muted">
              Editing rights are held only by this browser. If the link leaks, regenerate it — the old
              one stops working immediately.
            </p>
            <button
              type="button"
              className="btn btn-secondary plan-actions__regen"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? "Regenerating…" : "Regenerate link"}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

export default PlanActions;
