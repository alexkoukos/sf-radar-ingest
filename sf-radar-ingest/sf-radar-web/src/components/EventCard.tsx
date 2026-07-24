import type { DashboardEvent } from "../types";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { formatPrice, isGated, ptTimeFormatter, rsvpLabel, venueLabel } from "../lib/eventFormat";

interface EventCardProps {
  event: DashboardEvent;
  rank: number;
  attending: boolean;
  onToggleAttend: (apiId: string) => void;
  onSelect: (event: DashboardEvent) => void;
}

/** Rank is a display index into an already SQL-sorted list, never a re-sort. */
function tierClass(rank: number): string {
  if (rank === 1) return "ev-card--rank-1";
  if (rank <= 3) return "ev-card--rank-top";
  return "ev-card--rank-rest";
}

function formatRank(rank: number): string {
  return rank < 10 ? `0${rank}` : String(rank);
}

/**
 * Score high = visually loud, score low = visually quiet - carried here by
 * discrete rank tiers (1 / top-3 / rest) rather than a continuous fill,
 * since the Modernist card grid ranks by position, not by a score-driven
 * gradient. Paid/gated events are flagged, never hidden.
 */
function EventCard({ event, rank, attending, onToggleAttend, onSelect }: EventCardProps) {
  const gated = isGated(event);
  const score = event.score ?? 0;

  return (
    <li
      className={`card ev-card ${tierClass(rank)}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event);
        }
      }}
    >
      <span className="rank-badge">#{formatRank(rank)}</span>
      <div className="card-kicker">
        {CATEGORY_LABELS[event.category] ?? event.category} &middot; Score {Math.round(score * 100)}
      </div>
      <div className="card-title ev-card__title">{event.name}</div>
      <div className="card-meta ev-card__meta">
        {event.starts_at && <span>{ptTimeFormatter.format(new Date(event.starts_at))} PDT</span>}
        <span>{venueLabel(event)}</span>
        {event.host_name && <span>{event.host_name}</span>}
      </div>
      <div className="ev-card__tags">
        <span className={event.is_free ? "tag tag-accent" : "tag tag-neutral"}>{formatPrice(event)}</span>
        <span className={gated ? "tag tag-neutral" : "tag tag-accent-2"}>{rsvpLabel(event.rsvp_type)}</span>
        {gated && <span className="tag tag-outline">Harder to get into</span>}
      </div>
      <button
        type="button"
        className={`btn btn-block ev-card__attend${attending ? " ev-card__attend--active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleAttend(event.api_id);
        }}
      >
        {attending ? "Attending ✓" : "Attend"}
      </button>
    </li>
  );
}

export default EventCard;
