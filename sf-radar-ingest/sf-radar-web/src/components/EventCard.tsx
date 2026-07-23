import type { CSSProperties } from "react";
import type { DashboardEvent } from "../types";
import { scoreBreakdown } from "../lib/scoreBreakdown";

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const BREAKDOWN_BARS: Array<{ key: "keyword" | "venue" | "accessibility"; label: string }> = [
  { key: "keyword", label: "Keyword" },
  { key: "venue", label: "Venue" },
  { key: "accessibility", label: "Access" },
];

function formatPrice(event: DashboardEvent): string {
  if (event.is_free === true) return "Free";
  if (event.is_free === false) {
    return event.price_cents != null ? `$${(event.price_cents / 100).toFixed(0)}` : "Paid";
  }
  return "Price unknown";
}

function rsvpLabel(rsvpType: string): string {
  switch (rsvpType) {
    case "OPEN":
      return "Open RSVP";
    case "WAITLIST":
      return "Waitlist";
    case "APPLICATION":
      return "Application";
    case "INVITE_ONLY":
      return "Invite only";
    case "MEMBERS_ONLY":
      return "Members only";
    default:
      return "RSVP unknown";
  }
}

interface EventCardProps {
  event: DashboardEvent;
}

/**
 * Score high = visually loud, score low = visually quiet: the card's
 * emphasis (border/background intensity) scales continuously with
 * `--card-score`, set here and consumed by App.css. Paid/gated events are
 * dimmed and flagged, never hidden - the ranking already accounts for
 * accessibility, hiding would double-penalize them.
 */
function EventCard({ event }: EventCardProps) {
  const breakdown = scoreBreakdown(event);
  const gated = event.rsvp_type === "INVITE_ONLY" || event.rsvp_type === "MEMBERS_ONLY";
  const score = event.score ?? 0;

  return (
    <li
      className={`event-card${gated ? " event-card--gated" : ""}`}
      style={{ "--card-score": score } as CSSProperties}
    >
      <a
        className="event-card__title"
        href={event.url_slug ? `https://luma.com/${event.url_slug}` : undefined}
        target="_blank"
        rel="noreferrer"
      >
        <h2>{event.name}</h2>
      </a>

      <div className="event-meta">
        {event.starts_at && <span>{timeFormatter.format(new Date(event.starts_at))} PT</span>}
        {event.host_name && <span>{event.host_name}</span>}
        {event.sublocality && <span>{event.sublocality}</span>}
        <span className={event.is_free ? "badge badge--free" : "badge"}>{formatPrice(event)}</span>
        <span className={gated ? "badge badge--gated" : "badge badge--open"}>{rsvpLabel(event.rsvp_type)}</span>
        {gated && <span className="badge badge--flag">Harder to get into</span>}
      </div>

      <div className="score-breakdown" aria-label="Why this ranked here">
        {BREAKDOWN_BARS.map(({ key, label }) => (
          <div className="score-bar" key={key}>
            <span className="score-bar__label">{label}</span>
            <span className="score-bar__track">
              <span className="score-bar__fill" style={{ width: `${breakdown[key] * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}

export default EventCard;
