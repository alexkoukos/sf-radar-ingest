import { useEffect, useMemo, useState } from "react";
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
import { loadStartDate, saveStartDate } from "./lib/startDate";
import { isFreeAndOpen, isNewcomerFriendly } from "./lib/scoreBreakdown";
import NightStrip, { STRONG_SCORE_THRESHOLD } from "./components/NightStrip";
import EventCard from "./components/EventCard";
import EventModal from "./components/EventModal";
import FilterChips from "./components/FilterChips";
import SortRow, { type SortMode } from "./components/SortRow";
import LogNightForm from "./components/LogNightForm";
import LoggedNightCard from "./components/LoggedNightCard";
import "./App.css";

const WINDOW_DAYS = 14;
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
// Explicit PT, never the viewer's browser locale - the dev machine being in
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
  const [plan, setPlan] = useState<LocalPlan>({ attending: {}, logged: [] });
  const [startDateStr, setStartDateStr] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);

  useEffect(() => {
    setPlan(loadLocalPlan());
    setStartDateStr(loadStartDate());
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

  const visibleEvents = useMemo(() => {
    let list = selectedNight !== null ? (eventsByNight.get(selectedNight) ?? []) : windowEvents;
    if (activeCategory) list = list.filter((e) => e.category === activeCategory);
    if (newcomerFriendlyOnly) list = list.filter(isNewcomerFriendly);
    if (freeAndOpenOnly) list = list.filter(isFreeAndOpen);
    if (myPlanOnly) list = list.filter((e) => plan.attending[e.api_id]);
    return list;
  }, [windowEvents, eventsByNight, selectedNight, activeCategory, newcomerFriendlyOnly, freeAndOpenOnly, myPlanOnly, plan]);

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

  const showSkeleton = loading && events.length === 0;
  const nightsPlannedCount = bookedNightIndices.size;

  return (
    <main className="dashboard">
      <nav className="nav">
        <span className="nav-brand">SF RADAR</span>
        <button
          type="button"
          className="btn btn-primary nav__log"
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

      {staleSince && (
        <p className="banner banner--stale">
          Showing data from {staleTimestampFormatter.format(new Date(staleSince))} PT - couldn't refresh
          {error ? `: ${error}` : "."}
        </p>
      )}
      {!staleSince && error && events.length === 0 && (
        <p className="banner banner--error">Couldn't load events: {error}</p>
      )}

      <div className="hero">
        <div className="hero__top">
          <div>
            <div className="hero__range-row">
              {rangeLabel && <div className="hero__range">San Francisco &middot; {rangeLabel}</div>}
              {todayStr && (
                <label className="hero__arrive">
                  <span>Arriving</span>
                  <input
                    type="date"
                    className="input hero__arrive-input"
                    value={startDateStr ?? todayStr}
                    min={todayStr}
                    max={maxStartDateStr ?? undefined}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="hero__nav">
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                aria-label="Previous night"
                disabled={selectedNight === null}
                onClick={goPrevNight}
              >
                ←
              </button>
              <h2 className="hero__heading">
                {selectedNight === null || !wideNights ? (
                  <>
                    Your Stay <span className="text-muted hero__sub">— all {WINDOW_DAYS} nights</span>
                  </>
                ) : (
                  <>
                    <span className="hero__night-accent">Night {selectedNight - startOffset + 1}</span> of {WINDOW_DAYS}{" "}
                    <span className="text-muted hero__sub">— {nightHeadingFormatter.format(wideNights[selectedNight].start)}</span>
                  </>
                )}
              </h2>
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
          </div>
          <div className="hero__stats">
            {windowNights && events.length > 0 && (
              <div className="hero__stat">
                {nightsWithEvents} of {WINDOW_DAYS} nights have events
              </div>
            )}
            <div className="hero__stat hero__stat--plan">
              {nightsPlannedCount} {nightsPlannedCount === 1 ? "night" : "nights"} planned
            </div>
          </div>
        </div>

        {windowNights && events.length > 0 && (
          <NightStrip
            nights={windowNights}
            eventsByNight={eventsByNight}
            selected={selectedNight}
            onSelect={setSelectedNight}
            bookedNights={bookedNightIndices}
          />
        )}
      </div>

      {events.length > 0 && (
        <SortRow
          sortMode={sortMode}
          onBalanced={() => {
            setActiveCategory(null);
            setFreeAndOpenOnly(false);
          }}
          onFree={() => {
            setFreeAndOpenOnly(true);
            setActiveCategory(null);
          }}
          onInvestor={() => {
            setActiveCategory("INVESTOR_MEETUP");
            setFreeAndOpenOnly(false);
          }}
          tonightOnly={selectedNight === startOffset}
          onToggleTonight={() => setSelectedNight((prev) => (prev === startOffset ? null : startOffset))}
          myPlanOnly={myPlanOnly}
          onToggleMyPlan={() => setMyPlanOnly((v) => !v)}
        />
      )}

      {selectedNight !== null && selectedNightConflictCount >= 2 && (
        <p className="conflict-flag">{selectedNightConflictCount} strong picks tonight — you can only make one</p>
      )}

      {events.length > 0 && (
        <FilterChips
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          newcomerFriendlyOnly={newcomerFriendlyOnly}
          onToggleNewcomerFriendly={() => setNewcomerFriendlyOnly((v) => !v)}
          freeAndOpenOnly={freeAndOpenOnly}
          onToggleFreeAndOpen={() => setFreeAndOpenOnly((v) => !v)}
        />
      )}

      {showSkeleton && (
        <ul className="ev-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li className="card ev-card ev-card--skeleton" key={i} />
          ))}
        </ul>
      )}

      {!showSkeleton && !error && windowEvents.length === 0 && visibleLogged.length === 0 && (
        <p>No events in this window.</p>
      )}
      {!showSkeleton && windowEvents.length > 0 && visibleEvents.length === 0 && visibleLogged.length === 0 && (
        <p>No events match these filters.</p>
      )}

      <ul className="ev-grid">
        {visibleEvents.map((event, i) => (
          <EventCard
            key={event.api_id}
            event={event}
            rank={i + 1}
            attending={!!plan.attending[event.api_id]}
            onToggleAttend={toggleAttend}
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

      <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </main>
  );
}

export default App;
