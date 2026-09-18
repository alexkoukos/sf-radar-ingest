import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import type { DashboardEvent } from "./types";
import {
  daysBetweenDateStrings,
  fetchNightBoundaries,
  laDateString,
  nightIndexFor,
  type Night,
} from "./lib/timeBoundaries";
import { loadCachedEvents, saveCachedEvents } from "./lib/storage";
import { createLoggedId, loadLocalPlan, saveLocalPlan, type LocalPlan } from "./lib/localPlan";
import { loadEventFlags, saveEventFlags, type EventFlags } from "./lib/eventFlags";
import { loadStartDate, saveStartDate } from "./lib/startDate";
import { GROUP_CHANGED_EVENT, loadGroupMembership, type GroupMembership } from "./lib/groupMembership";
import { laZoneAbbrev } from "./lib/eventFormat";
import { isFreeAndOpen, isNewcomerFriendly } from "./lib/scoreBreakdown";
import NightStrip, { STRONG_SCORE_THRESHOLD } from "./components/NightStrip";
import EventCard from "./components/EventCard";
import EventModal from "./components/EventModal";
import FilterChips from "./components/FilterChips";
import PlanActions from "./components/PlanActions";
import SortRow, { type SortMode } from "./components/SortRow";
import ViewToggle from "./components/ViewToggle";
import LogNightForm from "./components/LogNightForm";
import LoggedNightCard from "./components/LoggedNightCard";
import "./App.css";

const WINDOW_DAYS = 14;
// "Your Stay - all 14 nights" can list every event in the window at once
// (dozens+). Page it: first BATCH_SIZE, then grow by BATCH_SIZE on a
// "Load more" tap or when the scroll sentinel nears the viewport. The
// single-night view is already short and is never paged.
const BATCH_SIZE = 20;
// Fetched wider than the 14 nights shown at once so the arrival picker can
// re-anchor the window client-side without a second call to the frozen
// get_dashboard_events RPC or a new parameter.
const WIDE_DAYS = 21;
const MAX_START_OFFSET = WIDE_DAYS - WINDOW_DAYS;

const rangeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});
const nightHeadingFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
});
// Explicit PDT, never the viewer's browser locale - the dev machine being in
// Athens is exactly why this class of bug hides from local testing.
const staleTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unknown error";
}

function App() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [wideNights, setWideNights] = useState<Night[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<string | null>(null);

  const [selectedNight, setSelectedNight] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DashboardEvent | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [newcomerFriendlyOnly, setNewcomerFriendlyOnly] = useState(false);
  const [freeAndOpenOnly, setFreeAndOpenOnly] = useState(false);
  const [myPlanOnly, setMyPlanOnly] = useState(false);
  // VIEW-row subset filters over the local eventFlags. Part of the same
  // 0-or-1-active group as myPlanOnly / "Tonight only".
  const [seenOnly, setSeenOnly] = useState(false);
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [plan, setPlan] = useState<LocalPlan>({ attending: {}, logged: [] });
  const [startDateStr, setStartDateStr] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logToast, setLogToast] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupMembership | null>(null);
  // Personal, local-only per-event flags: "seen" (dim, still listed) and
  // "hidden" (dropped from the list). Keyed by api_id, never synced, and
  // fully independent of plan.attending.
  const [eventFlags, setEventFlags] = useState<EventFlags>({ seen: {}, hidden: {} });
  // How many events the all-nights list currently shows. Reset to BATCH_SIZE
  // whenever the list identity changes (filters, sort, window anchor, or
  // entering/leaving a single night) so a new filter starts at batch one
  // instead of appending onto a stale offset.
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPlan(loadLocalPlan());
    setStartDateStr(loadStartDate());
    setGroup(loadGroupMembership());
    setEventFlags(loadEventFlags()); // prunes entries older than 180 days

    const onGroupChange = () => setGroup(loadGroupMembership());
    window.addEventListener(GROUP_CHANGED_EVENT, onGroupChange);
    window.addEventListener("storage", onGroupChange); // other tabs
    return () => {
      window.removeEventListener(GROUP_CHANGED_EVENT, onGroupChange);
      window.removeEventListener("storage", onGroupChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const cached = loadCachedEvents();
    if (cached) {
      setEvents(cached.events);
      setLoading(false);
    }

    async function load() {
      try {
        const [eventsResult, boundaries] = await Promise.all([
          supabase.rpc("get_dashboard_events", { p_days: WIDE_DAYS }),
          fetchNightBoundaries(WIDE_DAYS),
        ]);
        if (cancelled) return;
        if (eventsResult.error) throw eventsResult.error;

        const fresh = (eventsResult.data ?? []) as DashboardEvent[];
        setEvents(fresh);
        setWideNights(boundaries);
        setError(null);
        setStaleSince(null);
        saveCachedEvents(fresh);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
        if (cached) setStaleSince(cached.fetchedAt);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const todayStr = wideNights ? laDateString(wideNights[0].start) : null;
  const maxStartDateStr = wideNights ? laDateString(wideNights[MAX_START_OFFSET].start) : null;

  const startOffset = useMemo(() => {
    if (!wideNights || !startDateStr) return 0;
    const diff = daysBetweenDateStrings(laDateString(wideNights[0].start), startDateStr);
    return Math.min(Math.max(diff, 0), MAX_START_OFFSET);
  }, [wideNights, startDateStr]);

  const windowNights = useMemo(
    () => (wideNights ? wideNights.slice(startOffset, startOffset + WINDOW_DAYS) : null),
    [wideNights, startOffset],
  );

  const eventsByNight = useMemo(() => {
    const map = new Map<number, DashboardEvent[]>();
    if (!wideNights) return map;
    for (const event of events) {
      if (!event.starts_at) continue;
      const index = nightIndexFor(event.starts_at, wideNights);
      if (index === null) continue;
      if (!map.has(index)) map.set(index, []);
      map.get(index)!.push(event);
    }
    return map;
  }, [events, wideNights]);

  const windowEvents = useMemo(() => {
    // No boundaries (e.g. la_window_start() failed and we're on cached
    // events only) means we can't slice by window - show everything cached
    // rather than nothing, so a dead network degrades to stale data, not a
    // blank page.
    if (!windowNights) return events;
    const idxSet = new Set(windowNights.map((n) => n.index));
    return events.filter((e) => idxSet.has(e.starts_at ? (nightIndexFor(e.starts_at, wideNights!) ?? -1) : -1));
  }, [events, windowNights, wideNights]);

  const categories = useMemo(
    () => Array.from(new Set(windowEvents.map((e) => e.category))).sort(),
    [windowEvents],
  );

  const hiddenIds = useMemo(() => new Set(Object.keys(eventFlags.hidden)), [eventFlags.hidden]);
  const seenIds = useMemo(() => new Set(Object.keys(eventFlags.seen)), [eventFlags.seen]);

  const visibleEvents = useMemo(() => {
    let list = selectedNight !== null ? (eventsByNight.get(selectedNight) ?? []) : windowEvents;
    if (hiddenOnly) {
      // "Hidden" view: the hidden set is the whole list, nothing else excluded.
      list = list.filter((e) => hiddenIds.has(e.api_id));
    } else {
      if (hiddenIds.size) list = list.filter((e) => !hiddenIds.has(e.api_id));
      if (seenOnly) list = list.filter((e) => seenIds.has(e.api_id));
    }
    if (activeCategory) list = list.filter((e) => e.category === activeCategory);
    if (newcomerFriendlyOnly) list = list.filter(isNewcomerFriendly);
    if (freeAndOpenOnly) list = list.filter(isFreeAndOpen);
    if (myPlanOnly) list = list.filter((e) => plan.attending[e.api_id]);
    return list;
  }, [windowEvents, eventsByNight, selectedNight, hiddenIds, seenIds, hiddenOnly, seenOnly, activeCategory, newcomerFriendlyOnly, freeAndOpenOnly, myPlanOnly, plan]);

  // The all-nights list is paged; the single-night list is shown whole. Rank
  // numbers come from the index within visibleEvents, so slicing off the tail
  // leaves #01/#02/#03... untouched across batches.
  const allNightsView = selectedNight === null;
  const pagedEvents = allNightsView ? visibleEvents.slice(0, visibleCount) : visibleEvents;
  const hasMoreEvents = allNightsView && visibleEvents.length > visibleCount;

  // Any change to what the list *is* - filter chip, sort, arrival re-anchor,
  // or entering/leaving a single night - restarts it at batch one rather than
  // appending onto the previous offset.
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [selectedNight, startOffset, activeCategory, newcomerFriendlyOnly, freeAndOpenOnly, myPlanOnly, seenOnly, hiddenOnly]);

  // Unhiding cards one by one in the "Hidden" view ends on an empty list;
  // drop back to the default view rather than stranding the user there.
  useEffect(() => {
    if (hiddenOnly && hiddenIds.size === 0) setHiddenOnly(false);
  }, [hiddenOnly, hiddenIds]);

  // Infinite scroll: grow the list when the sentinel under it nears the
  // viewport. The visible "Load more" button is the tap fallback and the
  // path taken where IntersectionObserver is unavailable.
  useEffect(() => {
    if (!hasMoreEvents) return;
    const el = loadMoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((c) => c + BATCH_SIZE);
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreEvents, visibleCount]);

  const selectedNightConflictCount = useMemo(() => {
    if (selectedNight === null) return 0;
    return (eventsByNight.get(selectedNight) ?? []).filter(
      (e) => (e.score ?? 0) >= STRONG_SCORE_THRESHOLD,
    ).length;
  }, [selectedNight, eventsByNight]);

  const nightsWithEvents = useMemo(() => {
    if (!windowNights) return 0;
    return windowNights.filter((n) => (eventsByNight.get(n.index)?.length ?? 0) > 0).length;
  }, [windowNights, eventsByNight]);

  const rangeLabel = windowNights
    ? `${rangeFormatter.format(windowNights[0].start)} – ${rangeFormatter.format(windowNights[windowNights.length - 1].start)}`
    : null;

  // The honest "how fresh is this" stamp: the newest last_seen_at in the
  // payload is the last ingest run that actually saw these events.
  const lastUpdated = useMemo(() => {
    let latest = 0;
    for (const e of events) {
      const t = Date.parse(e.last_seen_at);
      if (t > latest) latest = t;
    }
    return latest ? new Date(latest) : null;
  }, [events]);

  // Which nights carry either a ranked "Attending" pick or a self-logged
  // entry - drives both the strip's booked fill and the plan counter, and
  // isn't scoped to the currently displayed window, so re-anchoring the
  // arrival date never silently drops a plan you already made.
  const bookedNightIndices = useMemo(() => {
    const set = new Set<number>();
    if (wideNights) {
      for (const event of events) {
        if (plan.attending[event.api_id] && event.starts_at) {
          const idx = nightIndexFor(event.starts_at, wideNights);
          if (idx !== null) set.add(idx);
        }
      }
    }
    for (const logged of plan.logged) set.add(logged.nightIndex);
    return set;
  }, [events, plan, wideNights]);

  const visibleLogged = useMemo(() => {
    if (!windowNights) return [];
    const idxSet = new Set(windowNights.map((n) => n.index));
    return plan.logged.filter((l) => (selectedNight !== null ? l.nightIndex === selectedNight : idxSet.has(l.nightIndex)));
  }, [plan.logged, selectedNight, windowNights]);

  // Live events currently marked Attending - what "Download .ics" (and,
  // next stage, the subscribe-able feed) operates on.
  const attendingEvents = useMemo(
    () => events.filter((e) => plan.attending[e.api_id]),
    [events, plan.attending],
  );

  // Self-logged nights resolved from night index to an LA calendar date -
  // the shape a published plan row (and its calendar feed) stores.
  const planLoggedNights = useMemo(() => {
    if (!wideNights) return [];
    return plan.logged.flatMap((l) => {
      const night = wideNights.find((n) => n.index === l.nightIndex);
      return night ? [{ date: laDateString(night.start), title: l.title, note: l.note }] : [];
    });
  }, [plan.logged, wideNights]);

  function nightLabelFor(nightIndex: number): string {
    const night = wideNights?.find((n) => n.index === nightIndex);
    return night ? nightHeadingFormatter.format(night.start) : "";
  }

  const sortMode: SortMode = freeAndOpenOnly
    ? "free"
    : activeCategory === "INVESTOR_MEETUP"
      ? "investor"
      : activeCategory === null
        ? "balanced"
        : null;

  function toggleAttend(apiId: string) {
    setPlan((prev) => {
      const next = { ...prev, attending: { ...prev.attending, [apiId]: !prev.attending[apiId] } };
      saveLocalPlan(next);
      return next;
    });
  }

  function toggleSeen(apiId: string) {
    setEventFlags((prev) => {
      const seen = { ...prev.seen };
      if (seen[apiId]) delete seen[apiId];
      else seen[apiId] = Date.now();
      const next = { ...prev, seen };
      saveEventFlags(next);
      return next;
    });
  }

  function toggleHidden(apiId: string) {
    setEventFlags((prev) => {
      const hidden = { ...prev.hidden };
      if (hidden[apiId]) delete hidden[apiId]; // "Unhide" from the Hidden view
      else hidden[apiId] = Date.now();
      const next = { ...prev, hidden };
      saveEventFlags(next);
      return next;
    });
  }

  function clearHidden() {
    setEventFlags((prev) => {
      const next = { ...prev, hidden: {} };
      saveEventFlags(next);
      return next;
    });
  }

  function addLoggedNight(entry: { nightIndex: number; title: string; note: string }) {
    setPlan((prev) => {
      const next = {
        ...prev,
        logged: [
          ...prev.logged,
          { id: createLoggedId(), nightIndex: entry.nightIndex, title: entry.title, note: entry.note, createdAt: new Date().toISOString() },
        ],
      };
      saveLocalPlan(next);
      return next;
    });
    setShowLogForm(false);
    // The new LoggedNightCard can land off-screen or be filtered out of the
    // current window/night, so confirm the save explicitly and name the night.
    setLogToast(`Added to your plan for ${nightLabelFor(entry.nightIndex)}.`);
    window.setTimeout(() => setLogToast(null), 3500);
  }

  function removeLoggedNight(id: string) {
    setPlan((prev) => {
      const next = { ...prev, logged: prev.logged.filter((l) => l.id !== id) };
      saveLocalPlan(next);
      return next;
    });
  }

  function handleStartDateChange(value: string) {
    if (!value) return;
    setStartDateStr(value);
    saveStartDate(value);
    setSelectedNight(null);
  }

  function goPrevNight() {
    setSelectedNight((prev) => {
      if (prev === null) return prev;
      return prev === startOffset ? null : prev - 1;
    });
  }

  function goNextNight() {
    setSelectedNight((prev) => {
      if (prev === null) return startOffset;
      return prev < startOffset + WINDOW_DAYS - 1 ? prev + 1 : prev;
    });
  }

  // The VIEW row - My Plan / Tonight only / Seen / Hidden - is one
  // mutually-exclusive group: turning any on clears the other three.
  // "None active" is the valid default. Only "Tonight only" also touches
  // selectedNight (which it shares with the strip); the others leave a
  // strip-selected night alone so they compose with night navigation.
  function clearOtherViews(keep: "myPlan" | "tonight" | "seen" | "hidden") {
    if (keep !== "myPlan") setMyPlanOnly(false);
    if (keep !== "tonight" && selectedNight === startOffset) setSelectedNight(null);
    if (keep !== "seen") setSeenOnly(false);
    if (keep !== "hidden") setHiddenOnly(false);
  }

  function toggleMyPlanOnly() {
    if (!myPlanOnly) clearOtherViews("myPlan");
    setMyPlanOnly((v) => !v);
  }

  function toggleTonightOnly() {
    const isActive = selectedNight === startOffset;
    if (!isActive) clearOtherViews("tonight");
    setSelectedNight(isActive ? null : startOffset);
  }

  function toggleSeenOnly() {
    if (!seenOnly) clearOtherViews("seen");
    setSeenOnly((v) => !v);
  }

  function toggleHiddenOnly() {
    if (!hiddenOnly) clearOtherViews("hidden");
    setHiddenOnly((v) => !v);
  }

  // The empty-state exit: drop every filter and view, keep the night choice.
  function clearFilters() {
    setActiveCategory(null);
    setNewcomerFriendlyOnly(false);
    setFreeAndOpenOnly(false);
    setMyPlanOnly(false);
    setSeenOnly(false);
    setHiddenOnly(false);
  }

  const filtersActive =
    activeCategory !== null || newcomerFriendlyOnly || freeAndOpenOnly || myPlanOnly || seenOnly || hiddenOnly;

  const showSkeleton = loading && events.length === 0;
  const nightsPlannedCount = bookedNightIndices.size;
  // The hub (GROUP / SHARE / CALENDAR) sits at the top, directly under the
  // header and above the night list, whenever the dashboard has data — GROUP
  // is useful before you've picked anything, and it's the only entry point to
  // creating a group.
  const hubVisible = events.length > 0;

  return (
    <>
      <a className="skip-link" href="#events">Skip to events</a>
      <main className="dashboard">
        <nav className="nav" aria-label="Main">
          <a className="nav-brand" href="/" translate="no">
            SF Radar<span className="dot-red">.</span>
          </a>
          {group && (
            <a className="nav__group" href={`/group/${group.slug}`} title={`Group: ${group.name}`}>
              <span className="nav__group-dot" style={{ background: group.color }} aria-hidden="true" />
              <span className="nav__group-name">{group.name}</span>
            </a>
          )}
          <button
            type="button"
            className="btn btn-secondary nav__log"
            aria-expanded={showLogForm}
            onClick={() => setShowLogForm((v) => !v)}
          >
            {showLogForm ? "Cancel" : "+ Log a night"}
          </button>
        </nav>

        {showLogForm && windowNights && (
          <LogNightForm
            nights={windowNights}
            defaultNightIndex={selectedNight ?? startOffset}
            onAdd={addLoggedNight}
            onCancel={() => setShowLogForm(false)}
          />
        )}

        <div aria-live="polite">
          {logToast && (
            <p className="log-toast plan-actions__toast" role="status">
              {logToast}
            </p>
          )}
        </div>

        {staleSince && (
          <p className="banner banner--stale" role="status">
            <strong>Offline copy.</strong> Showing events saved {staleTimestampFormatter.format(new Date(staleSince))}{" "}
            {laZoneAbbrev(new Date(staleSince))}. We couldn't reach the server{error ? ` (${error})` : ""}. Reload to try again.
          </p>
        )}
        {!staleSince && error && events.length === 0 && (
          <p className="banner banner--error" role="alert">
            <strong>Couldn't load events.</strong> {error}. Check your connection and reload the page.
          </p>
        )}

        <header className="hero">
          <p className="eyebrow hero__eyebrow">
            San Francisco{rangeLabel ? ` · ${rangeLabel}` : ""}
          </p>
          <h1 className="hero__title">
            {WINDOW_DAYS} nights in SF.
            <br />
            Make each one count<span className="dot-red">.</span>
          </h1>
          <p className="hero__lead">
            Tech, startup and investor events from Luma, ranked. Free, open events rank higher, because
            the best event is one you can actually get into.
          </p>
          {events.length > 0 && (
            <p className="hero__facts mono">
              <span>
                <strong className="num">{windowEvents.length}</strong> events
              </span>
              {windowNights && (
                <span>
                  <strong className="num">{nightsWithEvents}</strong>/{WINDOW_DAYS} nights covered
                </span>
              )}
              {lastUpdated && (
                <span>
                  Updated {staleTimestampFormatter.format(lastUpdated)} {laZoneAbbrev(lastUpdated)}
                </span>
              )}
            </p>
          )}
        </header>

        {hubVisible && (
          <PlanActions
            attendingEvents={attendingEvents}
            loggedNights={planLoggedNights}
            startDate={startDateStr}
          />
        )}

        <section className="stay" aria-labelledby="stay-title">
          <div className="stay__head">
            <div className="stay__titles">
              <h2 id="stay-title" className="section-title">
                <span className="section-title__num" aria-hidden="true">01.</span> Your stay
              </h2>
              <p className="stay__progress">
                <strong className="num">{nightsPlannedCount}</strong> of {WINDOW_DAYS} nights planned
              </p>
            </div>
            {todayStr && (
              <label className="stay__arrive">
                <span className="eyebrow">Arriving</span>
                <input
                  type="date"
                  name="arrival"
                  autoComplete="off"
                  className="input stay__arrive-input"
                  value={startDateStr ?? todayStr}
                  min={todayStr}
                  max={maxStartDateStr ?? undefined}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                />
              </label>
            )}
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-label="Nights planned"
            aria-valuemin={0}
            aria-valuemax={WINDOW_DAYS}
            aria-valuenow={nightsPlannedCount}
          >
            <span className="progress__fill" style={{ width: `${(Math.min(nightsPlannedCount, WINDOW_DAYS) / WINDOW_DAYS) * 100}%` }} />
          </div>
          <p className="stay__hint text-muted">
            {nightsPlannedCount === 0
              ? "Tap a night to see its best events, then add one to your plan."
              : nightsPlannedCount >= WINDOW_DAYS
                ? "Every night has a plan. Enjoy the city."
                : `${WINDOW_DAYS - nightsPlannedCount} nights still open.`}
          </p>

          {showSkeleton && <div className="night-strip night-strip--skeleton" aria-hidden="true" />}
          {windowNights && events.length > 0 && (
            <NightStrip
              nights={windowNights}
              eventsByNight={eventsByNight}
              selected={selectedNight}
              onSelect={setSelectedNight}
              bookedNights={bookedNightIndices}
            />
          )}

          {windowNights && events.length > 0 && (
            <div className="night-nav">
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                aria-label="Previous night"
                disabled={selectedNight === null}
                onClick={goPrevNight}
              >
                ←
              </button>
              <p className="night-nav__label" aria-live="polite">
                {selectedNight === null || !wideNights ? (
                  <>
                    <strong>All {WINDOW_DAYS} nights</strong>
                    <span className="text-muted"> · tap a night to focus</span>
                  </>
                ) : (
                  <>
                    <strong>Night {selectedNight - startOffset + 1}</strong>
                    <span className="text-muted"> of {WINDOW_DAYS} · {nightHeadingFormatter.format(wideNights[selectedNight].start)}</span>
                  </>
                )}
              </p>
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                aria-label="Next night"
                disabled={selectedNight === startOffset + WINDOW_DAYS - 1}
                onClick={goNextNight}
              >
                →
              </button>
            </div>
          )}
        </section>

        <section className="picks" id="events" aria-labelledby="picks-title" tabIndex={-1}>
          <h2 id="picks-title" className="section-title">
            <span className="section-title__num" aria-hidden="true">02.</span> Ranked picks
            {!showSkeleton && visibleEvents.length > 0 && (
              <span className="section-title__count num"> {visibleEvents.length}</span>
            )}
          </h2>

          {events.length > 0 && (
            <div className="controls">
              <SortRow
                sortMode={sortMode}
                onBalanced={() => {
                  setActiveCategory(null);
                  setFreeAndOpenOnly(false);
                }}
                onInvestor={() => {
                  setActiveCategory("INVESTOR_MEETUP");
                  setFreeAndOpenOnly(false);
                }}
              />
              <ViewToggle
                myPlanOnly={myPlanOnly}
                onToggleMyPlan={toggleMyPlanOnly}
                tonightOnly={selectedNight === startOffset}
                onToggleTonight={toggleTonightOnly}
                seenOnly={seenOnly}
                onToggleSeenOnly={toggleSeenOnly}
                hiddenOnly={hiddenOnly}
                onToggleHiddenOnly={toggleHiddenOnly}
              />
              <FilterChips
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                newcomerFriendlyOnly={newcomerFriendlyOnly}
                onToggleNewcomerFriendly={() => setNewcomerFriendlyOnly((v) => !v)}
                freeAndOpenOnly={freeAndOpenOnly}
                onToggleFreeAndOpen={() => setFreeAndOpenOnly((v) => !v)}
              />
            </div>
          )}

          {selectedNight !== null && selectedNightConflictCount >= 2 && (
            <p className="conflict-flag">
              <strong>{selectedNightConflictCount} strong picks tonight.</strong> You can only make one. Pick the one you'd regret missing.
            </p>
          )}

          {showSkeleton && (
            <ul className="ev-grid" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <li className="card ev-card ev-card--skeleton" key={i}>
                  <span className="sk sk--num" />
                  <span className="sk sk--line" />
                  <span className="sk sk--title" />
                  <span className="sk sk--line sk--short" />
                </li>
              ))}
            </ul>
          )}

          {!showSkeleton && !error && windowEvents.length === 0 && visibleLogged.length === 0 && (
            <div className="empty">
              <p className="empty__title">Nothing on the radar for these dates yet.</p>
              <p className="text-muted">New events land every six hours. Try a different arrival date, or check back tonight.</p>
            </div>
          )}
          {!showSkeleton && windowEvents.length > 0 && visibleEvents.length === 0 && visibleLogged.length === 0 && (
            <div className="empty">
              <p className="empty__title">
                {seenOnly
                  ? "Nothing marked seen yet."
                  : hiddenOnly
                    ? "Nothing hidden."
                    : myPlanOnly
                      ? "Your plan is empty."
                      : "No events match these filters."}
              </p>
              <p className="text-muted">
                {myPlanOnly
                  ? "Add an event with “+ Add to plan” and it shows up here."
                  : seenOnly
                    ? "Tap “Mark seen” on events you've already checked out."
                    : hiddenOnly
                      ? "Events you hide land here, so you can bring them back."
                      : "Loosen a filter to see more of the city."}
              </p>
              {filtersActive && (
                <button type="button" className="btn btn-primary" onClick={clearFilters}>
                  Show all events
                </button>
              )}
            </div>
          )}

          <ul className="ev-grid">
            {pagedEvents.map((event, i) => (
              <EventCard
                key={event.api_id}
                event={event}
                rank={i + 1}
                attending={!!plan.attending[event.api_id]}
                seen={!!eventFlags.seen[event.api_id]}
                view={hiddenOnly ? "hidden" : seenOnly ? "seen" : "default"}
                onToggleAttend={toggleAttend}
                onToggleSeen={toggleSeen}
                onToggleHidden={toggleHidden}
                onSelect={setSelectedEvent}
              />
            ))}
            {visibleLogged.map((logged) => (
              <LoggedNightCard
                key={logged.id}
                logged={logged}
                nightLabel={nightLabelFor(logged.nightIndex)}
                onRemove={removeLoggedNight}
              />
            ))}
          </ul>

          {hasMoreEvents && (
            <div className="ev-loadmore" ref={loadMoreRef}>
              <button
                type="button"
                className="btn btn-secondary ev-loadmore__btn"
                onClick={() => setVisibleCount((c) => c + BATCH_SIZE)}
              >
                Show more · <span className="num">{visibleEvents.length - visibleCount}</span> left
              </button>
            </div>
          )}

          {events.length > 0 && hiddenIds.size > 0 && !hiddenOnly && (
            <p className="ev-hidden-note">
              {hiddenIds.size} event{hiddenIds.size === 1 ? "" : "s"} hidden ·{" "}
              <button type="button" className="linklike" onClick={() => toggleHiddenOnly()}>
                Review
              </button>
              {" · "}
              <button type="button" className="linklike" onClick={clearHidden}>
                Unhide all
              </button>
            </p>
          )}
        </section>

        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          attending={selectedEvent ? !!plan.attending[selectedEvent.api_id] : false}
          onToggleAttend={toggleAttend}
        />

        <footer className="app-footer">
          <p className="app-footer__line">
            Fourteen nights go fast. See you out there<span className="dot-red">.</span>
          </p>
          <p className="text-muted">
            Built by <a href="mailto:alex.koukos2006@gmail.com" className="app-footer__link">Alex Koukos</a> for the HH community. Events from Luma, times in Pacific.
          </p>
        </footer>
      </main>
    </>
  );
}

export default App;
