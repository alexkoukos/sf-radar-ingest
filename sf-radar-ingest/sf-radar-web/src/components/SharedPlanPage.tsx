import { useEffect, useMemo, useState } from "react";
import type { SharedLoggedNight, SharedPlan, SharedEventSnapshot } from "../lib/sharedPlan";
import { fetchSharedPlan } from "../lib/sharedPlan";
import { downloadPlanIcs } from "../lib/icsDownload";
import { possessivePhrase } from "../lib/possessive";
import { laDateString } from "../lib/timeBoundaries";
import SharedEventCard from "./SharedEventCard";
import "../App.css";

const headingFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "short",
  day: "numeric",
});
const rangeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});
const createdFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
  year: "numeric",
});

interface NightGroup {
  date: string;
  events: SharedEventSnapshot[];
  logged: SharedLoggedNight[];
}

function groupByNight(plan: SharedPlan): NightGroup[] {
  const byDate = new Map<string, NightGroup>();
  const ensure = (date: string) => {
    let group = byDate.get(date);
    if (!group) {
      group = { date, events: [], logged: [] };
      byDate.set(date, group);
    }
    return group;
  };

  for (const event of plan.attending) {
    if (!event.starts_at) continue;
    ensure(laDateString(new Date(event.starts_at))).events.push(event);
  }
  for (const logged of plan.logged) {
    if (!logged.date) continue;
    ensure(logged.date).logged.push(logged);
  }

  for (const group of byDate.values()) {
    group.events.sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? ""));
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function SharedPlanPage({ slug }: { slug: string }) {
  const [plan, setPlan] = useState<SharedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [icsToast, setIcsToast] = useState<string | null>(null);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const previousTitle = document.title;
    document.title = "Shared plan · SF Radar";
    return () => {
      meta.remove();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSharedPlan(slug)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setNotFound(true);
        } else {
          setPlan(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this plan.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const nights = useMemo(() => (plan ? groupByNight(plan) : []), [plan]);
  const eventCount = plan?.attending.length ?? 0;
  const rangeLabel = useMemo(() => {
    if (nights.length === 0) return null;
    const first = new Date(`${nights[0].date}T12:00:00Z`);
    const last = new Date(`${nights[nights.length - 1].date}T12:00:00Z`);
    return nights.length === 1
      ? rangeFormatter.format(first)
      : `${rangeFormatter.format(first)} – ${rangeFormatter.format(last)}`;
  }, [nights]);

  function handleDownload() {
    if (!plan) return;
    const result = downloadPlanIcs(plan.attending, {
      tzMode: plan.tz_mode ?? "tzid",
      calName: possessivePhrase(plan.display_name ?? "", "SF Radar plan"),
      filename: "sf-radar-shared-plan.ics",
    });
    setIcsToast(result.ok ? `Downloaded ${result.count} event${result.count === 1 ? "" : "s"} (.ics)` : (result.error ?? "Export failed"));
    window.setTimeout(() => setIcsToast(null), 3000);
  }

  return (
    <main className="dashboard shared-plan">
      <nav className="nav">
        <span className="nav-brand">SF RADAR</span>
        <a className="btn btn-secondary nav__log" href="/">
          Open SF Radar
        </a>
      </nav>

      <div className="hero">
        <div className="hero__range-row">
          <div className="hero__range">Shared plan{rangeLabel ? ` · ${rangeLabel}` : ""}</div>
        </div>
        <h1 className="hero__heading">Someone's SF nights</h1>
        <p className="shared-plan__sub text-muted">
          A read-only snapshot of the events on this plan
          {plan ? `, shared ${createdFormatter.format(new Date(plan.created_at))}` : ""}. Not editable here.
        </p>
        {eventCount > 0 && (
          <div className="plan-actions">
            <button type="button" className="btn btn-primary" onClick={handleDownload}>
              Download .ics
            </button>
            {icsToast && <span className="plan-actions__toast" role="status">{icsToast}</span>}
          </div>
        )}
      </div>

      {loading && (
        <ul className="ev-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li className="card ev-card ev-card--skeleton" key={i} />
          ))}
        </ul>
      )}

      {!loading && notFound && (
        <p className="banner banner--error">
          This shared plan link isn't valid, or it was never published. Check the link and try again.
        </p>
      )}
      {!loading && error && (
        <p className="banner banner--error">Couldn't load this plan: {error}</p>
      )}

      {!loading && plan && nights.length === 0 && (
        <p>This shared plan has no events on it yet.</p>
      )}

      {!loading &&
        plan &&
        nights.map((night) => (
          <section className="shared-plan__night" key={night.date}>
            <h2 className="shared-plan__night-heading">
              {headingFormatter.format(new Date(`${night.date}T12:00:00Z`))}
            </h2>
            <ul className="ev-grid">
              {night.events.map((event) => (
                <SharedEventCard key={event.api_id} event={event} />
              ))}
              {night.logged.map((logged, i) => (
                <li className="card ev-card ev-card--logged" key={`logged-${i}`}>
                  <div className="card-kicker">Personal plan</div>
                  <div className="card-title">{logged.title}</div>
                  {logged.note && <p className="card-body">{logged.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}

      <footer className="app-footer">
        Made with <a className="app-footer__link" href="/">SF Radar</a>
      </footer>
    </main>
  );
}

export default SharedPlanPage;
