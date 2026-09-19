import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import type { DashboardEvent } from "./types";
import { loadCachedEvents, saveCachedEvents } from "./lib/storage";
import { loadLocalPlan, saveLocalPlan, type LocalPlan } from "./lib/localPlan";
import { laZoneAbbrev } from "./lib/eventFormat";
import { isFreeAndOpen, isNewcomerFriendly } from "./lib/scoreBreakdown";
import { dayLongLabel, eventDayKey, monthName, monthOf, todayKey } from "./lib/dayKeys";
import DatePicker, { ANY_DAY } from "./components/DatePicker";
import EventCard from "./components/EventCard";
import Dropdown from "./components/Dropdown";
import FilterOptions from "./components/FilterOptions";
import PlanActions from "./components/PlanActions";
import { activeFilterCount, NO_FILTERS, type Filters } from "./lib/filters";
import "./App.css";

// How far ahead to fetch. get_dashboard_events already takes any day count;
// ~two months covers "this month" and "next month" in the month picker.
// Luma rarely lists events further out than that.
const FETCH_DAYS = 62;
// Infinite scroll: the list grows by PAGE_SIZE when the sentinel under it
// nears the viewport. It only ever appends below what's being read, so
// nothing above shifts. The "Show more" button stays as the tap and
// keyboard fallback, and the path where IntersectionObserver is missing.
const PAGE_SIZE = 10;

// Explicit Pacific time, never the viewer's browser locale.
const stampFormatter = new Intl.DateTimeFormat("en-US", {
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

/**
 * The whole app: pick a month and a day, read a ranked list, save what you
 * like. Deliberately one column, one control group, two actions per event,
 * and no motion - calm and predictable over clever.
 */
function App() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<string | null>(null);

  const [month, setMonth] = useState<string>(() => monthOf(todayKey()));
  const [day, setDay] = useState<string>(ANY_DAY);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [plan, setPlan] = useState<LocalPlan>({ attending: {}, logged: [] });
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPlan(loadLocalPlan());
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
        const result = await supabase.rpc("get_dashboard_events", { p_days: FETCH_DAYS });
        if (cancelled) return;
        if (result.error) throw result.error;
        const fresh = (result.data ?? []) as DashboardEvent[];
        setEvents(fresh);
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

  const today = todayKey();

  // Upcoming events only (a cached copy can hold days that have passed),
  // each tagged with its Pacific calendar day. Order is the SQL rank order.
  const dated = useMemo(
    () =>
      events.flatMap((e) => {
        if (!e.starts_at) return [];
        const key = eventDayKey(e.starts_at);
        return key >= today ? [{ event: e, day: key }] : [];
      }),
    [events, today],
  );

  const months = useMemo(() => {
    const set = new Set(dated.map((d) => monthOf(d.day)));
    return Array.from(set).sort();
  }, [dated]);

  // If the chosen month has no events (e.g. the last days of a month are
  // empty), fall back to the first month that does.
  const activeMonth = months.includes(month) ? month : (months[0] ?? month);

  // Every non-date filter in one place, so the day counts, the category
  // counts and the list can never disagree.
  const passes = useMemo(() => {
    return (e: DashboardEvent, ignoreCategories = false) =>
      (!filters.freeOnly || isFreeAndOpen(e)) &&
      (!filters.openOnly || isNewcomerFriendly(e)) &&
      (!filters.savedOnly || !!plan.attending[e.api_id]) &&
      (ignoreCategories || filters.categories.length === 0 || filters.categories.includes(e.category));
  }, [filters, plan.attending]);

  const monthEvents = useMemo(() => dated.filter((d) => monthOf(d.day) === activeMonth), [dated, activeMonth]);

  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of monthEvents) {
      if (!passes(d.event)) continue;
      counts.set(d.day, (counts.get(d.day) ?? 0) + 1);
    }
    return Array.from(counts, ([key, count]) => ({ key, count })).sort((a, b) => a.key.localeCompare(b.key));
  }, [monthEvents, passes]);

  // Category options: what's in this month, counted with the other filters
  // applied (but not the category choice itself, so options don't vanish).
  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of monthEvents) {
      if (!passes(d.event, true)) continue;
      counts.set(d.event.category, (counts.get(d.event.category) ?? 0) + 1);
    }
    return Array.from(counts, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }, [monthEvents, passes]);

  const activeDay = day !== ANY_DAY && days.some((d) => d.key === day) ? day : ANY_DAY;

  const list = useMemo(
    () =>
      monthEvents
        .filter((d) => activeDay === ANY_DAY || d.day === activeDay)
        .filter((d) => passes(d.event))
        .map((d) => d.event),
    [monthEvents, activeDay, passes],
  );

  const savedCount = useMemo(
    () => dated.filter((d) => plan.attending[d.event.api_id]).length,
    [dated, plan.attending],
  );

  const hasMore = list.length > visibleCount;

  useEffect(() => {
    if (!hasMore) return;
    const el = moreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisibleCount((c) => c + PAGE_SIZE);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  // A new question gets a fresh first page.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeMonth, activeDay, filters]);

  const lastUpdated = useMemo(() => {
    let latest = 0;
    for (const e of events) {
      const t = Date.parse(e.last_seen_at);
      if (t > latest) latest = t;
    }
    return latest ? new Date(latest) : null;
  }, [events]);

  // What Group & share exports: every saved event we still have data for.
  const savedEvents = useMemo(() => events.filter((e) => plan.attending[e.api_id]), [events, plan.attending]);
  const filterCount = activeFilterCount(filters);

  function toggleSave(apiId: string) {
    setPlan((prev) => {
      const next = { ...prev, attending: { ...prev.attending, [apiId]: !prev.attending[apiId] } };
      saveLocalPlan(next);
      return next;
    });
  }

  function changeMonth(value: string) {
    setMonth(value);
    setDay(ANY_DAY);
  }

  const showSkeleton = loading && events.length === 0;
  const shown = list.slice(0, visibleCount);
  const remaining = list.length - shown.length;
  const where = activeDay === ANY_DAY ? `in ${monthName(activeMonth)}` : `on ${dayLongLabel(activeDay)}`;
  const resultLine = `${list.length} ${filters.savedOnly ? "saved " : ""}${list.length === 1 ? "event" : "events"} ${where}`;

  return (
    <>
      <a className="skip-link" href="#events">Skip to events</a>
      <div className="page">
        <header className="top">
          <a className="brand" href="/" translate="no">
            SF Radar<span className="dot-red">.</span>
          </a>
          {/* Phones: Group & share sits up here, level with the logo. From
              720px the same button lives at the end of the control row. */}
          {events.length > 0 && (
            <Dropdown
              className="dropdown--share dropdown--share-top"
              label="Group & share"
              panelLabel="Group, share and calendar"
              align="right"
              wide
            >
              <PlanActions attendingEvents={savedEvents} loggedNights={[]} startDate={null} />
            </Dropdown>
          )}
        </header>

        <main id="main">

        <section className="intro">
          <h1 className="intro__title">
            Tech events in San Francisco<span className="dot-red">.</span>
          </h1>
          <p className="intro__lead">Best events first. Free events anyone can join are ranked higher.</p>
        </section>

        {staleSince && (
          <p className="banner" role="status">
            <strong>You're offline.</strong> Showing events saved {stampFormatter.format(new Date(staleSince))}{" "}
            {laZoneAbbrev(new Date(staleSince))}. Reload to try again.
          </p>
        )}
        {!staleSince && error && events.length === 0 && (
          <p className="banner" role="alert">
            <strong>Couldn't load events.</strong> Check your connection and reload the page.
          </p>
        )}

        {months.length > 0 && (
          <DatePicker
            months={months}
            month={activeMonth}
            onMonthChange={changeMonth}
            days={days}
            day={activeDay}
            onDayChange={setDay}
            today={today}
          >
            <Dropdown
              className="dropdown--filters"
              label={filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
              panelLabel="Filters"
              active={filterCount > 0}
            >
              <FilterOptions
                filters={filters}
                onChange={setFilters}
                categories={categoryOptions}
                savedCount={savedCount}
              />
            </Dropdown>
            <Dropdown
              className="dropdown--share dropdown--share-row"
              label="Group & share"
              panelLabel="Group, share and calendar"
              align="right"
              wide
            >
              <PlanActions attendingEvents={savedEvents} loggedNights={[]} startDate={null} />
            </Dropdown>
          </DatePicker>
        )}

        <section className="results" id="events" aria-labelledby="results-title" tabIndex={-1}>
          {!showSkeleton && months.length > 0 && (
            <h2 id="results-title" className="results__title" aria-live="polite">
              {resultLine}
            </h2>
          )}

          {showSkeleton && (
            <ul className="list" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <li className="ev ev--skeleton" key={i}>
                  <span className="sk sk--num" />
                  <span className="ev__body">
                    <span className="sk sk--title" />
                    <span className="sk sk--line" />
                    <span className="sk sk--line sk--short" />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!showSkeleton && !error && months.length === 0 && (
            <div className="empty">
              <p className="empty__title">No upcoming events yet.</p>
              <p className="text-muted">New events are added every few hours. Check back later.</p>
            </div>
          )}

          {!showSkeleton && months.length > 0 && list.length === 0 && (
            <div className="empty">
              <p className="empty__title">
                {filters.savedOnly ? "Nothing saved here yet." : activeDay === ANY_DAY ? "No events match." : "No events on this day."}
              </p>
              <p className="text-muted">
                {filters.savedOnly ? "Tap “Save” on an event to keep it here." : "Try another day, or clear the filters."}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setDay(ANY_DAY);
                  setFilters(NO_FILTERS);
                }}
              >
                Show all of {monthName(activeMonth)}
              </button>
            </div>
          )}

          {shown.length > 0 && (
            <ol className="list">
              {shown.map((event, i) => (
                <EventCard
                  key={event.api_id}
                  event={event}
                  rank={i + 1}
                  saved={!!plan.attending[event.api_id]}
                  onToggleSave={toggleSave}
                />
              ))}
            </ol>
          )}

          {remaining > 0 && (
            <div className="more" ref={moreRef}>
              <button type="button" className="btn btn-secondary" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Show more ({remaining} left)
              </button>
            </div>
          )}
        </section>

        </main>

        <footer className="foot">
          <p>
            Events from Luma. All times in Pacific time.
            {lastUpdated && (
              <>
                {" "}Updated {stampFormatter.format(lastUpdated)} {laZoneAbbrev(lastUpdated)}.
              </>
            )}
          </p>
          <p>
            Built by <a href="https://www.linkedin.com/in/alexandros-koukos-952a42344" target="_blank" rel="noreferrer">Alex Koukos</a> for the HH community.
          </p>
        </footer>
      </div>
    </>
  );
}

export default App;
