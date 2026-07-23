import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import type { DashboardEvent } from "./types";
import { fetchNightBoundaries, nightIndexFor, type Night } from "./lib/timeBoundaries";
import { loadCachedEvents, saveCachedEvents } from "./lib/storage";
import { isFreeAndOpen, isNewcomerFriendly } from "./lib/scoreBreakdown";
import NightStrip, { STRONG_SCORE_THRESHOLD } from "./components/NightStrip";
import EventCard from "./components/EventCard";
import FilterChips from "./components/FilterChips";
import "./App.css";

const WINDOW_DAYS = 14;

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unknown error";
}

function App() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [nights, setNights] = useState<Night[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleSince, setStaleSince] = useState<string | null>(null);

  const [selectedNight, setSelectedNight] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [newcomerFriendlyOnly, setNewcomerFriendlyOnly] = useState(false);
  const [freeAndOpenOnly, setFreeAndOpenOnly] = useState(false);

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
          supabase.rpc("get_dashboard_events", { p_days: WINDOW_DAYS }),
          fetchNightBoundaries(),
        ]);
        if (cancelled) return;
        if (eventsResult.error) throw eventsResult.error;

        const fresh = (eventsResult.data ?? []) as DashboardEvent[];
        setEvents(fresh);
        setNights(boundaries);
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

  const eventsByNight = useMemo(() => {
    const map = new Map<number, DashboardEvent[]>();
    if (!nights) return map;
    for (const event of events) {
      if (!event.starts_at) continue;
      const index = nightIndexFor(event.starts_at, nights);
      if (index === null) continue;
      if (!map.has(index)) map.set(index, []);
      map.get(index)!.push(event);
    }
    return map;
  }, [events, nights]);

  const categories = useMemo(
    () => Array.from(new Set(events.map((e) => e.category))).sort(),
    [events],
  );

  const visibleEvents = useMemo(() => {
    let list = selectedNight !== null ? (eventsByNight.get(selectedNight) ?? []) : events;
    if (activeCategory) list = list.filter((e) => e.category === activeCategory);
    if (newcomerFriendlyOnly) list = list.filter(isNewcomerFriendly);
    if (freeAndOpenOnly) list = list.filter(isFreeAndOpen);
    return list;
  }, [events, eventsByNight, selectedNight, activeCategory, newcomerFriendlyOnly, freeAndOpenOnly]);

  const selectedNightConflictCount = useMemo(() => {
    if (selectedNight === null) return 0;
    return (eventsByNight.get(selectedNight) ?? []).filter(
      (e) => (e.score ?? 0) >= STRONG_SCORE_THRESHOLD,
    ).length;
  }, [selectedNight, eventsByNight]);

  const showSkeleton = loading && events.length === 0;

  return (
    <main className="dashboard">
      <h1>SF events, next {WINDOW_DAYS} nights</h1>

      {staleSince && (
        <p className="banner banner--stale">
          Showing data from {new Date(staleSince).toLocaleString()} - couldn't refresh
          {error ? `: ${error}` : "."}
        </p>
      )}
      {!staleSince && error && events.length === 0 && (
        <p className="banner banner--error">Couldn't load events: {error}</p>
      )}

      {nights && events.length > 0 && (
        <NightStrip
          nights={nights}
          eventsByNight={eventsByNight}
          selected={selectedNight}
          onSelect={setSelectedNight}
        />
      )}

      {selectedNight !== null && (
        <div className="night-detail-header">
          <span>
            {selectedNightConflictCount >= 2
              ? `${selectedNightConflictCount} strong picks tonight — you can only make one`
              : "This evening"}
          </span>
          <button type="button" className="chip" onClick={() => setSelectedNight(null)}>
            Your Stay (all {WINDOW_DAYS} nights)
          </button>
        </div>
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
        <ul className="event-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li className="event-card event-card--skeleton" key={i} />
          ))}
        </ul>
      )}

      {!showSkeleton && !error && events.length === 0 && <p>No events in this window.</p>}
      {!showSkeleton && events.length > 0 && visibleEvents.length === 0 && (
        <p>No events match these filters.</p>
      )}

      <ul className="event-list">
        {visibleEvents.map((event) => (
          <EventCard key={event.api_id} event={event} />
        ))}
      </ul>
    </main>
  );
}

export default App;
