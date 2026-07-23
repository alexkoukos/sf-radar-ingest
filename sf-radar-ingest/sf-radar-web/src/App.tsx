import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import type { DashboardEvent } from "./types";
import "./App.css";

const WINDOW_DAYS = 14;

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function App() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .rpc("get_dashboard_events", { p_days: WINDOW_DAYS })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else {
          setEvents((data ?? []) as DashboardEvent[]);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="dashboard">
      <h1>SF events, next {WINDOW_DAYS} days</h1>

      {loading && <p>Loading…</p>}
      {error && <p className="error">Couldn't load events: {error}</p>}
      {!loading && !error && events.length === 0 && <p>No events in this window.</p>}

      <ul className="event-list">
        {events.map((event) => (
          <li key={event.api_id} className="event-card">
            <a href={event.url_slug ? `https://luma.com/${event.url_slug}` : undefined}>
              <h2>{event.name}</h2>
            </a>
            <div className="event-meta">
              {event.starts_at && <span>{timeFormatter.format(new Date(event.starts_at))}</span>}
              {event.sublocality && <span>{event.sublocality}</span>}
              {event.is_free === true && <span>Free</span>}
              {event.rsvp_type && <span>{event.rsvp_type}</span>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

export default App;
